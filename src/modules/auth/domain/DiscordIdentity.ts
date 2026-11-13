/** What Discord tells us about the account that authorized the sign-in. */
export type DiscordIdentity = {
	id: string;
	username: string;
	/** Display name; null when the account never set one. */
	globalName: string | null;
	/** Null when the account has no email or did not grant the email scope. */
	email: string | null;
	/** True only when Discord has verified the address. */
	emailVerified: boolean;
};
