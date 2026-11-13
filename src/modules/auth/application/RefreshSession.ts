import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../shared/errors/ForbiddenError";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { UserRepository } from "../../user";
import { REFRESH_REUSE_GRACE_SECONDS, RefreshTokenRepository } from "../domain/RefreshToken";
import { hashRefreshToken, SessionTokens } from "./SessionTokens";

export type RefreshedSession = {
	id: string;
	token: string;
	username: string;
	mustUpgrade: boolean;
	refreshToken: string;
};

/**
 * Trades a refresh token for a new session. The token works once: the session it
 * returns carries its successor.
 *
 * A token that comes back after it was used means it exists in two places. Which holder
 * is the legitimate one cannot be told from here, so the whole sign-in is revoked and
 * both have to sign in again.
 */
export class RefreshSession {
	constructor(
		private readonly tokens: Pick<
			RefreshTokenRepository,
			"consume" | "findByHash" | "revokeFamily"
		>,
		private readonly sessionTokens: Pick<SessionTokens, "issue">,
		private readonly users: Pick<UserRepository, "findById">,
		private readonly activeBans: { execute(userId: string): Promise<unknown | null> },
		private readonly jwt: JWT,
		private readonly logger: Logger,
	) {}

	async run({ refreshToken, now }: { refreshToken: string; now: Date }): Promise<RefreshedSession> {
		const tokenHash = hashRefreshToken(refreshToken);
		const record = await this.tokens.consume(tokenHash, now);
		if (!record) {
			await this.revokeIfReused(tokenHash, now);
			throw new AuthenticationError("Invalid or expired refresh token");
		}

		const user = await this.users.findById(record.userId);
		if (!user) {
			throw new AuthenticationError("Invalid or expired refresh token");
		}
		if (await this.activeBans.execute(user.id)) {
			await this.tokens.revokeFamily(record.familyId, now);
			throw new ForbiddenError("User is banned");
		}

		const next = await this.sessionTokens.issue({
			userId: user.id,
			mustUpgrade: record.mustUpgrade,
			now,
			familyId: record.familyId,
		});
		const claims = record.mustUpgrade
			? { id: user.id, role: user.role, mustUpgrade: true }
			: { id: user.id, role: user.role };

		return {
			id: user.id,
			token: this.jwt.generate(claims),
			username: user.username,
			mustUpgrade: record.mustUpgrade,
			refreshToken: next,
		};
	}

	private async revokeIfReused(tokenHash: string, now: Date): Promise<void> {
		const seen = await this.tokens.findByHash(tokenHash);
		if (!seen?.usedAt || seen.revokedAt) return;

		const secondsSinceUse = (now.getTime() - seen.usedAt.getTime()) / 1000;
		if (secondsSinceUse <= REFRESH_REUSE_GRACE_SECONDS) return;

		this.logger.error(`Refresh token reused for user ${seen.userId}; revoking the sign-in`);
		await this.tokens.revokeFamily(seen.familyId, now);
	}
}
