import { DiscordIdentity } from "./DiscordIdentity";

/** A Discord identity waiting for its owner to pick a username and a password. */
export type DiscordRegistration = {
	discordId: string;
	/** Address Discord verified; it becomes the account's email. */
	email: string;
};

/**
 * Holds a registration between the redirect back from Discord and the form the
 * user submits. The ticket is what the frontend sends back with that form, so
 * the Discord identity never has to pass through the browser.
 */
export interface DiscordRegistrationStore {
	/** Stores the registration and returns its ticket. */
	save(registration: DiscordRegistration): Promise<string>;
	/** The registration behind the ticket, or null when unknown or expired. */
	find(ticket: string): Promise<DiscordRegistration | null>;
	remove(ticket: string): Promise<void>;
}

/** Time to choose a username and a password before starting over. */
export const DISCORD_REGISTRATION_TTL_SECONDS = 900;

const USERNAME_MAX_LENGTH = 14;

/**
 * Username offered on the registration form. A Discord name can be longer than
 * ours allows, so it is cut to fit; whether it is free is checked when the user
 * submits the form, and they can change it there.
 */
export function suggestUsername(
	identity: Pick<DiscordIdentity, "username" | "globalName">,
): string {
	const candidates = [identity.username, identity.globalName ?? ""];
	for (const candidate of candidates) {
		const cleaned = candidate.replace(/\s+/g, "").slice(0, USERNAME_MAX_LENGTH);
		if (cleaned) return cleaned;
	}
	return "";
}
