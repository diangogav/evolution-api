/** Records that an email address was proven to belong to its user. */
export interface EmailVerifications {
	/** Marks the user's email as verified at `at`; an earlier verification is kept. */
	markVerified(userId: string, at: Date): Promise<void>;
}

/**
 * Claim carried by the token mailed for a password reset. Whoever presents a
 * token with it opened the email, which a session token does not prove.
 */
export const PASSWORD_RESET_PURPOSE = "password-reset";

/**
 * Whether a decoded token is the one mailed for a password reset.
 *
 * Session tokens are signed with the same key and also name a user, so the
 * signature alone does not tell them apart. Accepting one would let whoever
 * holds a session set a new password without knowing the current one.
 */
export function isPasswordResetToken(claims: { purpose?: unknown; role?: unknown }): boolean {
	if (claims.purpose !== undefined) return claims.purpose === PASSWORD_RESET_PURPOSE;

	// Reset links mailed before the claim existed carry only the user id; they stay
	// valid for their one-hour life. Every session token carries a role.
	return claims.role === undefined;
}
