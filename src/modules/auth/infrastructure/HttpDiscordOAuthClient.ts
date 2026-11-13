import { DiscordIdentity } from "../domain/DiscordIdentity";
import { DiscordOAuthClient } from "../domain/DiscordOAuthClient";

const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const TOKEN_URL = "https://discord.com/api/oauth2/token";
const CURRENT_USER_URL = "https://discord.com/api/users/@me";
// `identify` gives the account id and name; `email` gives the address and whether Discord verified it.
const SCOPES = "identify email";
const REQUEST_TIMEOUT_MS = 10_000;

export type DiscordOAuthSettings = {
	clientId: string;
	clientSecret: string;
	/** This API's callback URL, exactly as registered in the Discord application. */
	redirectUri: string;
};

export class HttpDiscordOAuthClient implements DiscordOAuthClient {
	constructor(
		private readonly settings: DiscordOAuthSettings,
		private readonly fetchFn: typeof fetch = fetch,
	) {}

	authorizeUrl(state: string): string {
		const query = new URLSearchParams({
			response_type: "code",
			client_id: this.settings.clientId,
			scope: SCOPES,
			redirect_uri: this.settings.redirectUri,
			state,
			// Skips the consent screen for someone who already authorized the application.
			prompt: "none",
		});
		return `${AUTHORIZE_URL}?${query.toString()}`;
	}

	async fetchIdentity(code: string): Promise<DiscordIdentity> {
		const accessToken = await this.exchangeCode(code);
		const response = await this.fetchFn(CURRENT_USER_URL, {
			headers: { authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(`Discord answered ${response.status} to the user request`);
		}

		const body = (await response.json()) as Record<string, unknown>;
		if (typeof body.id !== "string" || typeof body.username !== "string") {
			throw new Error("Discord sent a user without id or username");
		}

		return {
			id: body.id,
			username: body.username,
			globalName: typeof body.global_name === "string" ? body.global_name : null,
			email: typeof body.email === "string" ? body.email : null,
			emailVerified: body.verified === true,
		};
	}

	// The token is used once to read the identity and never stored: this API does
	// nothing on Discord on the user's behalf.
	private async exchangeCode(code: string): Promise<string> {
		const response = await this.fetchFn(TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: this.settings.clientId,
				client_secret: this.settings.clientSecret,
				grant_type: "authorization_code",
				code,
				redirect_uri: this.settings.redirectUri,
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(`Discord answered ${response.status} to the token request`);
		}

		const body = (await response.json()) as Record<string, unknown>;
		if (typeof body.access_token !== "string") {
			throw new Error("Discord sent no access token");
		}
		return body.access_token;
	}
}
