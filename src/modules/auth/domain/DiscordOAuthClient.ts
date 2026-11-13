import { DiscordIdentity } from "./DiscordIdentity";

/** Talks to Discord's OAuth2 endpoints. */
export interface DiscordOAuthClient {
	/** URL of Discord's consent page; Discord echoes `state` back to the callback. */
	authorizeUrl(state: string): string;
	/** Trades the authorization code for the identity behind it. Rejects when Discord refuses the code. */
	fetchIdentity(code: string): Promise<DiscordIdentity>;
}
