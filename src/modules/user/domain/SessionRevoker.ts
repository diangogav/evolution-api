/**
 * Ends every sign-in of a user, on every device.
 *
 * Whoever changes the password or the email of an account is declaring that the old
 * credentials may be in the wrong hands; sessions started with them must not outlive that.
 */
export interface SessionRevoker {
	revokeAllForUser(userId: string, now: Date): Promise<void>;
}
