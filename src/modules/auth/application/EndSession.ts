import { RefreshTokenRepository } from "../domain/RefreshToken";
import { hashRefreshToken } from "./SessionTokens";

/** Signs a device out: the sign-in its refresh token belongs to stops working. */
export class EndSession {
	constructor(
		private readonly tokens: Pick<RefreshTokenRepository, "findByHash" | "revokeFamily">,
	) {}

	// Idempotent and silent about unknown tokens: signing out never fails, and the answer
	// must not tell a caller whether a token exists.
	async run({ refreshToken, now }: { refreshToken: string; now: Date }): Promise<void> {
		const record = await this.tokens.findByHash(hashRefreshToken(refreshToken));
		if (record) await this.tokens.revokeFamily(record.familyId, now);
	}
}
