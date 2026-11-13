/** How long a session survives without the client coming back; every renewal restarts it. */
export const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Two tabs of one browser can renew with the same token almost at once. Inside this
 * window the second request is refused without treating it as theft.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 10;

/** A refresh token as stored: its hash, never the token. */
export type StoredRefreshToken = {
	id: string;
	userId: string;
	/** Shared by every token descended from one sign-in. */
	familyId: string;
	tokenHash: string;
	/** True when the sign-in still owes an account password. */
	mustUpgrade: boolean;
	createdAt: Date;
	expiresAt: Date;
};

/** What the store knows about a token that was presented. */
export type RefreshTokenRecord = {
	userId: string;
	familyId: string;
	mustUpgrade: boolean;
	usedAt: Date | null;
	revokedAt: Date | null;
	expiresAt: Date;
};

export interface RefreshTokenRepository {
	save(token: StoredRefreshToken): Promise<void>;

	/**
	 * Marks the token as used and returns it, or null when it is unknown, expired,
	 * revoked or already used. Atomic: of two requests with one token, only one wins.
	 */
	consume(tokenHash: string, now: Date): Promise<RefreshTokenRecord | null>;

	findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;

	/** Ends one sign-in: every token descended from it stops working. */
	revokeFamily(familyId: string, now: Date): Promise<void>;

	/** Ends every sign-in of the user, on every device. */
	revokeAllForUser(userId: string, now: Date): Promise<void>;

	/** Removes the user's tokens that expired; they can never be used again. */
	deleteExpired(userId: string, now: Date): Promise<void>;
}

export function refreshTokenExpiry(now: Date): Date {
	return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
