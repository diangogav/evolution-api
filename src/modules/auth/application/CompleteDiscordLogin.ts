import { Logger } from "../../../shared/logger/domain/Logger";
import { DiscordIdentity } from "../domain/DiscordIdentity";
import { DiscordOAuthClient } from "../domain/DiscordOAuthClient";
import { DiscordReturnLinkBuilder } from "../domain/DiscordReturnLinkBuilder";
import { LoginCodeStore } from "../domain/LoginCodeStore";
import { AdmitDiscordIdentity } from "./AdmitDiscordIdentity";
import { DiscordLoginState } from "./DiscordLoginState";
import { LinkDiscordToUser } from "./LinkDiscordToUser";

export type CompleteDiscordLoginInput = {
	/** Authorization code Discord sent; absent when the user declined. */
	code?: string | null;
	/** The `state` Discord echoed back. */
	state?: string | null;
	/** Nonce read from the browser cookie set when the sign-in started. */
	nonce?: string | null;
	/** Error Discord reported instead of a code, e.g. `access_denied`. */
	error?: string | null;
	now: Date;
};

export type CompleteDiscordLoginResult = {
	/** Frontend URL to send the browser to, carrying a login code, a registration ticket or an error. */
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
		private readonly admit: Pick<AdmitDiscordIdentity, "run">,
		private readonly loginCodes: Pick<LoginCodeStore, "issue">,
		private readonly state: DiscordLoginState,
		private readonly links: Pick<DiscordReturnLinkBuilder, "build">,
		private readonly logger: Logger,
		private readonly linkToUser: Pick<LinkDiscordToUser, "run">,
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

		if (payload.linkUserId) {
			const result = await this.linkToUser.run(payload.linkUserId, identity, input.now);
			return {
				redirectUrl: this.links.build(
					payload.origin,
					result.linked ? { linked: "true", redirect: payload.redirect } : { error: result.error },
				),
			};
		}

		const admission = await this.admit.run(identity, input.now);
		if (admission.kind === "error") {
			return { redirectUrl: this.links.build(payload.origin, { error: admission.error }) };
		}
		if (admission.kind === "register") {
			return {
				redirectUrl: this.links.build(payload.origin, {
					register: admission.ticket,
					username: admission.username,
					redirect: payload.redirect,
				}),
			};
		}

		const code = await this.loginCodes.issue(admission.userId);
		return {
			redirectUrl: this.links.build(payload.origin, { code, redirect: payload.redirect }),
		};
	}
}
