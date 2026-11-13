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
