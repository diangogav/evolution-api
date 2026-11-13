import { DiscordOAuthClient } from "../domain/DiscordOAuthClient";
import { DiscordReturnLinkBuilder, sanitizeReturnPath } from "../domain/DiscordReturnLinkBuilder";
import { DiscordLoginState } from "./DiscordLoginState";

export type StartDiscordLoginInput = {
	/** Origin of the frontend that started the sign-in. */
	origin?: string | null;
	/** Path inside that frontend to open once signed in. */
	redirect?: string | null;
};

export type StartDiscordLoginResult = {
	/** Discord's consent page, where the browser goes next. */
	authorizeUrl: string;
	/** Value for the browser cookie that ties the callback to this browser. */
	nonce: string;
};

export class StartDiscordLogin {
	constructor(
		private readonly oauthClient: Pick<DiscordOAuthClient, "authorizeUrl">,
		private readonly state: DiscordLoginState,
		private readonly links: Pick<DiscordReturnLinkBuilder, "resolveOrigin">,
		private readonly newNonce: () => string,
	) {}

	run(input: StartDiscordLoginInput): StartDiscordLoginResult {
		const nonce = this.newNonce();
		const state = this.state.sign({
			origin: this.links.resolveOrigin(input.origin),
			redirect: sanitizeReturnPath(input.redirect),
			nonce,
		});

		return { authorizeUrl: this.oauthClient.authorizeUrl(state), nonce };
	}
}
