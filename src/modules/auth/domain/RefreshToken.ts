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
	/** The User-Agent header of the request that signed in or renewed; null when absent. */
	userAgent: string | null;
	/** When the sign-in this token descends from happened; copied on every renewal. */
	signedInAt: Date;
};

/** What the store knows about a token that was presented. */
export type RefreshTokenRecord = {
	userId: string;
	familyId: string;
	mustUpgrade: boolean;
	usedAt: Date | null;
	revokedAt: Date | null;
	expiresAt: Date;
	userAgent: string | null;
	signedInAt: Date;
};

/** One sign-in that can still be renewed, described by its newest token. */
export type ActiveSession = {
	familyId: string;
	userAgent: string | null;
	signedInAt: Date;
	/** When the newest token was issued: the last renewal, or the sign-in itself. */
	lastUsedAt: Date;
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

	/** Ends every sign-in of the user, on every device, and returns the ids it ended. */
	revokeAllForUser(userId: string, now: Date): Promise<string[]>;

	/** Ends every sign-in of the user except `keepFamilyId`, and returns the ids it ended. */
	revokeAllForUserExcept(userId: string, keepFamilyId: string, now: Date): Promise<string[]>;

	/** The user's sign-ins whose newest token is neither revoked nor expired. */
	listActiveForUser(userId: string, now: Date): Promise<ActiveSession[]>;

	/** Removes the user's tokens that expired; they can never be used again. */
	deleteExpired(userId: string, now: Date): Promise<void>;
}

export function refreshTokenExpiry(now: Date): Date {
	return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
