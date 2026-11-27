import { RefreshTokenRepository } from "../domain/RefreshToken";
import { RevokedSessions } from "../domain/RevokedSessions";

/**
 * Ends sign-ins everywhere they live: their refresh tokens stop renewing and their JWTs
 * are refused from the next request. Every revocation goes through here, so no path
 * can end a sign-in and leave its JWT working.
 */
export class RevokeSessions {
	constructor(
		private readonly tokens: Pick<
			RefreshTokenRepository,
			"revokeFamily" | "revokeAllForUser" | "revokeAllForUserExcept"
		>,
		private readonly revoked: Pick<RevokedSessions, "markRevoked">,
	) {}

	async revokeFamily(familyId: string, now: Date): Promise<void> {
		await this.tokens.revokeFamily(familyId, now);
		await this.revoked.markRevoked([familyId]);
	}

	async revokeAllForUser(userId: string, now: Date): Promise<void> {
		await this.revoked.markRevoked(await this.tokens.revokeAllForUser(userId, now));
	}

	async revokeAllForUserExcept(userId: string, keepFamilyId: string, now: Date): Promise<void> {
		await this.revoked.markRevoked(
			await this.tokens.revokeAllForUserExcept(userId, keepFamilyId, now),
		);
	}
}
