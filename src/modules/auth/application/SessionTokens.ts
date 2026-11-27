import { createHash, randomBytes, randomUUID } from "crypto";

import { JWT } from "../../../shared/JWT";
import { RefreshTokenRepository, refreshTokenExpiry } from "../domain/RefreshToken";

/** The User-Agent header is client-controlled; this bounds what is stored. */
const USER_AGENT_MAX_LENGTH = 512;

export type IssueRefreshTokenInput = {
	userId: string;
	mustUpgrade: boolean;
	now: Date;
	userAgent?: string | null;
	/** Set when renewing, so the new token stays in the sign-in it descends from. */
	renewing?: { familyId: string; signedInAt: Date };
};

export type AttachSessionInput = {
	now: Date;
	userAgent: string | null;
};

/** Creates refresh tokens and hands the plain value to the caller exactly once. */
export class SessionTokens {
	constructor(
		private readonly tokens: Pick<RefreshTokenRepository, "save" | "deleteExpired">,
		private readonly jwt: Pick<JWT, "reissue">,
	) {}

	async issue(input: IssueRefreshTokenInput): Promise<string> {
		return (await this.issueInFamily(input)).refreshToken;
	}

	/**
	 * Starts a sign-in: stores its first refresh token and signs the session JWT again
	 * with `sid`, the sign-in's id, so a request can tell which device made it.
	 */
	async attach<T extends { id: string; token: string; mustUpgrade?: boolean }>(
		session: T,
		{ now, userAgent }: AttachSessionInput,
	): Promise<T & { refreshToken: string }> {
		const { refreshToken, familyId } = await this.issueInFamily({
			userId: session.id,
			mustUpgrade: session.mustUpgrade === true,
			now,
			userAgent,
		});
		return { ...session, token: this.jwt.reissue(session.token, { sid: familyId }), refreshToken };
	}

	private async issueInFamily(
		input: IssueRefreshTokenInput,
	): Promise<{ refreshToken: string; familyId: string }> {
		// 256 random bits: not guessable, and nothing about the user can be read from it.
		const refreshToken = randomBytes(32).toString("base64url");
		const familyId = input.renewing?.familyId ?? randomUUID();

		await this.tokens.deleteExpired(input.userId, input.now);
		await this.tokens.save({
			id: randomUUID(),
			userId: input.userId,
			familyId,
			tokenHash: hashRefreshToken(refreshToken),
			mustUpgrade: input.mustUpgrade,
			createdAt: input.now,
			expiresAt: refreshTokenExpiry(input.now),
			userAgent: input.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) || null,
			signedInAt: input.renewing?.signedInAt ?? input.now,
		});
		return { refreshToken, familyId };
	}
}

export function hashRefreshToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
