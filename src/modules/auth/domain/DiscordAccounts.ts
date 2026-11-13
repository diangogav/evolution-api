/** The user a Discord account is linked to. */
export type LinkedAccount = {
	id: string;
};

/** Looks users up by the Discord account linked to them. */
export interface DiscordAccounts {
	findByDiscordId(discordId: string): Promise<LinkedAccount | null>;
}
