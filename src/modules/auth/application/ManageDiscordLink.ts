import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { DiscordAccounts } from "../domain/DiscordAccounts";
import { sanitizeReturnPath } from "../domain/DiscordReturnLinkBuilder";
import { DiscordLinkIntent } from "./DiscordLinkIntent";

export type DiscordLinkView = {
	linked: boolean;
	/** False when unlinking would leave the user without an account password to sign in with. */
	canUnlink: boolean;
};

/** What the settings screen does with a user's Discord link: show it, start it, remove it. */
export class ManageDiscordLink {
	constructor(
		private readonly accounts: Pick<DiscordAccounts, "findLinkStatus" | "unlink">,
		private readonly intents: Pick<DiscordLinkIntent, "sign">,
		/** This API's route that starts a Discord flow. */
		private readonly startUrl: string,
	) {}

	async status(userId: string): Promise<DiscordLinkView> {
		const status = await this.accounts.findLinkStatus(userId);
		if (!status) throw new NotFoundError("User not found");

		return { linked: status.discordId !== null, canUnlink: status.hasPassword };
	}

	/** URL the browser navigates to in order to link Discord to this user. */
	begin(input: { userId: string; origin?: string | null; redirect?: string | null }): {
		url: string;
	} {
		const url = new URL(this.startUrl);
		url.searchParams.set("link", this.intents.sign(input.userId));
		if (input.origin) url.searchParams.set("origin", input.origin);
		url.searchParams.set("redirect", sanitizeReturnPath(input.redirect));

		return { url: url.toString() };
	}

	async unlink(userId: string): Promise<void> {
		const status = await this.accounts.findLinkStatus(userId);
		if (!status) throw new NotFoundError("User not found");
		if (!status.discordId) return;
		if (!status.hasPassword) {
			throw new ConflictError("Set an account password before unlinking Discord");
		}

		await this.accounts.unlink(userId);
	}
}
