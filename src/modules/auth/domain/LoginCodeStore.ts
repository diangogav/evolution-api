/**
 * Single-use codes that stand for a finished sign-in.
 *
 * The browser comes back from Discord through a redirect, and a URL is the
 * wrong place for a session token: it lands in history and logs. The redirect
 * carries one of these codes instead, and the client trades it for the token
 * with a request of its own.
 */
export interface LoginCodeStore {
	/** Stores a code for the user and returns it. */
	issue(userId: string): Promise<string>;
	/** Returns the user behind the code and forgets it, or null when unknown or expired. */
	consume(code: string): Promise<string | null>;
}

/** Long enough for a redirect and one request, short enough to be useless if leaked. */
export const LOGIN_CODE_TTL_SECONDS = 60;
