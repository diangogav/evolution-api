/**
 * Sign-ins that were ended while their JWTs can still be valid.
 *
 * Revoking a sign-in stops its refresh tokens, but a JWT already handed out stays valid
 * until it expires. Remembering the sign-in for one JWT lifetime lets every request
 * refuse it at once, without shortening the JWT that clients without renewal rely on.
 */
export interface RevokedSessions {
	markRevoked(familyIds: readonly string[]): Promise<void>;
	isRevoked(familyId: string): Promise<boolean>;
}
