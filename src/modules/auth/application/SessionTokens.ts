import { createHash, randomBytes, randomUUID } from "crypto";

import { RefreshTokenRepository, refreshTokenExpiry } from "../domain/RefreshToken";

export type IssueRefreshTokenInput = {
	userId: string;
	mustUpgrade: boolean;
	now: Date;
	/** Set when renewing, so the new token stays in the sign-in it descends from. */
	familyId?: string;
};

/** Creates refresh tokens and hands the plain value to the caller exactly once. */
export class SessionTokens {
	constructor(private readonly tokens: Pick<RefreshTokenRepository, "save" | "deleteExpired">) {}

	async issue(input: IssueRefreshTokenInput): Promise<string> {
		// 256 random bits: not guessable, and nothing about the user can be read from it.
		const token = randomBytes(32).toString("base64url");

		await this.tokens.deleteExpired(input.userId, input.now);
		await this.tokens.save({
			id: randomUUID(),
			userId: input.userId,
			familyId: input.familyId ?? randomUUID(),
			tokenHash: hashRefreshToken(token),
			mustUpgrade: input.mustUpgrade,
			createdAt: input.now,
			expiresAt: refreshTokenExpiry(input.now),
		});
		return token;
	}

	/** Adds a refresh token to the session a sign-in produced. */
	async attach<T extends { id: string; mustUpgrade?: boolean }>(
		session: T,
		now: Date,
	): Promise<T & { refreshToken: string }> {
		const refreshToken = await this.issue({
			userId: session.id,
			mustUpgrade: session.mustUpgrade === true,
			now,
		});
		return { ...session, refreshToken };
	}
}

export function hashRefreshToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
