/** The user a Discord account is linked to. */
export type LinkedAccount = {
	id: string;
};

/** A user found by email while deciding whether a Discord account can be linked to it. */
export type EmailAccount = {
	id: string;
	username: string;
	email: string;
	/** Discord account already linked to the user, if any. */
	discordId: string | null;
	/** True for an account that was deleted; it can be neither linked nor replaced. */
	deleted: boolean;
};

/** Looks users up by their Discord account and links one to a user. */
export interface DiscordAccounts {
	findByDiscordId(discordId: string): Promise<LinkedAccount | null>;

	/** Every user whose email equals `email` ignoring case, deleted ones included. */
	findByEmail(email: string): Promise<EmailAccount[]>;

	/**
	 * Links the Discord account to the user and records the email as verified.
	 * Does nothing and answers false when the user already has a Discord account.
	 */
	link(userId: string, discordId: string, verifiedAt: Date): Promise<boolean>;
}
