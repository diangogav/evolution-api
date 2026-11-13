import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { DiscordRegistrationStore } from "../domain/DiscordRegistration";

export type RegisterWithDiscordInput = {
	/** Id for the new user. */
	id: string;
	/** Ticket received in the redirect back from Discord. */
	ticket: string;
	username: string;
	password: string;
	now: Date;
};

export type RegisteredAccount = {
	id: string;
	username: string;
	email: string;
	token: string;
	gamePassword: string;
};

/** Creates accounts; the user module's registration fits this shape. */
export interface AccountRegistrar {
	register(input: {
		id: string;
		email: string;
		username: string;
		password: string;
		discord: { discordId: string; emailVerifiedAt: Date };
	}): Promise<RegisteredAccount>;
}

/**
 * Creates the account of someone who arrived through Discord. The email and
 * the Discord account come from the ticket, never from the request, so the
 * form cannot claim an identity Discord did not vouch for.
 */
export class RegisterWithDiscord {
	constructor(
		private readonly registrations: Pick<DiscordRegistrationStore, "find" | "remove">,
		private readonly registrar: AccountRegistrar,
	) {}

	async run(input: RegisterWithDiscordInput): Promise<RegisteredAccount> {
		const registration = await this.registrations.find(input.ticket);
		if (!registration) {
			throw new AuthenticationError("Invalid or expired registration ticket");
		}

		const account = await this.registrar.register({
			id: input.id,
			email: registration.email,
			username: input.username,
			password: input.password,
			discord: { discordId: registration.discordId, emailVerifiedAt: input.now },
		});

		// Removed only after the account exists: a taken username or a weak password
		// leaves the ticket usable for another attempt.
		await this.registrations.remove(input.ticket);
		return account;
	}
}
