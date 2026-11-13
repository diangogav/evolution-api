import { DiscordAccounts } from "../domain/DiscordAccounts";
import { DiscordIdentity } from "../domain/DiscordIdentity";
import { DiscordLoginError } from "../domain/DiscordReturnLinkBuilder";

export type DiscordLinkResult = { linked: true } | { linked: false; error: DiscordLoginError };

/**
 * Links a Discord account to the signed-in user who asked for it. Unlike the
 * automatic link made while signing in, the emails do not have to match: the
 * user proved who they are with their session.
 */
export class LinkDiscordToUser {
	constructor(private readonly accounts: DiscordAccounts) {}

	async run(userId: string, identity: DiscordIdentity, now: Date): Promise<DiscordLinkResult> {
		const owner = await this.accounts.findByDiscordId(identity.id);
		if (owner) {
			return owner.id === userId ? { linked: true } : { linked: false, error: "discord_in_use" };
		}

		const status = await this.accounts.findLinkStatus(userId);
		if (!status) return { linked: false, error: "invalid_state" };
		if (status.discordId) return { linked: false, error: "already_linked" };

		// The link verifies the user's address only when Discord vouches for that same address.
		const sameEmail =
			identity.emailVerified && identity.email?.toLowerCase() === status.email.toLowerCase();

		const linked = await this.accounts.link(userId, identity.id, sameEmail ? now : null);
		return linked ? { linked: true } : { linked: false, error: "already_linked" };
	}
}
