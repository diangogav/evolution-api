import { Logger } from "../../../shared/logger/domain/Logger";
import { DiscordAccounts } from "../domain/DiscordAccounts";
import { DiscordIdentity } from "../domain/DiscordIdentity";
import { DiscordOAuthClient } from "../domain/DiscordOAuthClient";
import { DiscordReturnLinkBuilder } from "../domain/DiscordReturnLinkBuilder";
import { LoginCodeStore } from "../domain/LoginCodeStore";
import { DiscordLoginState } from "./DiscordLoginState";

export type CompleteDiscordLoginInput = {
	/** Authorization code Discord sent; absent when the user declined. */
	code?: string | null;
	/** The `state` Discord echoed back. */
	state?: string | null;
	/** Nonce read from the browser cookie set when the sign-in started. */
	nonce?: string | null;
	/** Error Discord reported instead of a code, e.g. `access_denied`. */
	error?: string | null;
};

export type CompleteDiscordLoginResult = {
	/** Frontend URL to send the browser to, carrying a login code or an error. */
	redirectUrl: string;
};

/**
 * Handles the redirect back from Discord. Every outcome, good or bad, ends in
 * a redirect to the frontend: the browser is mid-navigation and has nowhere
 * else to show a result.
 */
export class CompleteDiscordLogin {
	constructor(
		private readonly oauthClient: Pick<DiscordOAuthClient, "fetchIdentity">,
		private readonly accounts: DiscordAccounts,
		private readonly loginCodes: Pick<LoginCodeStore, "issue">,
		private readonly state: DiscordLoginState,
		private readonly links: Pick<DiscordReturnLinkBuilder, "build">,
		private readonly logger: Logger,
	) {}

	async run(input: CompleteDiscordLoginInput): Promise<CompleteDiscordLoginResult> {
		const payload = this.state.read(input.state);
		// Without a state of ours there is no trusted origin: the default frontend gets the error.
		if (!payload || !this.state.matchesNonce(payload, input.nonce)) {
			return { redirectUrl: this.links.build(payload?.origin, { error: "invalid_state" }) };
		}

		if (input.error || !input.code) {
			return { redirectUrl: this.links.build(payload.origin, { error: "access_denied" }) };
		}

		let identity: DiscordIdentity;
		try {
			identity = await this.oauthClient.fetchIdentity(input.code);
		} catch (error) {
			this.logger.error(`Discord sign-in failed while reading the identity: ${String(error)}`);
			return { redirectUrl: this.links.build(payload.origin, { error: "discord_unavailable" }) };
		}

		const account = await this.accounts.findByDiscordId(identity.id);
		if (!account) {
			return { redirectUrl: this.links.build(payload.origin, { error: "not_linked" }) };
		}

		const code = await this.loginCodes.issue(account.id);
		return {
			redirectUrl: this.links.build(payload.origin, { code, redirect: payload.redirect }),
		};
	}
}
