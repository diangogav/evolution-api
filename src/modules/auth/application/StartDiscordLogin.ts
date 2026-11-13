import { DiscordOAuthClient } from "../domain/DiscordOAuthClient";
import { DiscordReturnLinkBuilder, sanitizeReturnPath } from "../domain/DiscordReturnLinkBuilder";
import { DiscordLinkIntent } from "./DiscordLinkIntent";
import { DiscordLoginState } from "./DiscordLoginState";

export type StartDiscordLoginInput = {
	/** Origin of the frontend that started the flow. */
	origin?: string | null;
	/** Path inside that frontend to open afterwards. */
	redirect?: string | null;
	/** Link intent of a signed-in user; absent for a plain sign-in. */
	link?: string | null;
};

export type StartDiscordLoginResult = {
	/** Where the browser goes next: Discord's consent page, or the frontend on a bad intent. */
	location: string;
	/** Value for the browser cookie that ties the callback to this browser; null when there is no callback to wait for. */
	nonce: string | null;
};

export class StartDiscordLogin {
	constructor(
		private readonly oauthClient: Pick<DiscordOAuthClient, "authorizeUrl">,
		private readonly state: DiscordLoginState,
		private readonly links: Pick<DiscordReturnLinkBuilder, "resolveOrigin" | "build">,
		private readonly newNonce: () => string,
		private readonly intents: Pick<DiscordLinkIntent, "read">,
	) {}

	run(input: StartDiscordLoginInput): StartDiscordLoginResult {
		const origin = this.links.resolveOrigin(input.origin);

		let linkUserId: string | undefined;
		if (input.link) {
			// An intent that is not ours must not fall back to a plain sign-in: the user
			// asked to link, and signing them in as someone else would be a surprise.
			const userId = this.intents.read(input.link);
			if (!userId) {
				return { location: this.links.build(origin, { error: "invalid_state" }), nonce: null };
			}
			linkUserId = userId;
		}

		const nonce = this.newNonce();
		const state = this.state.sign({
			origin,
			redirect: sanitizeReturnPath(input.redirect),
			nonce,
			linkUserId,
		});

		return { location: this.oauthClient.authorizeUrl(state), nonce };
	}
}
