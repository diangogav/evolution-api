import { User } from "./User";

/** Proof of identity that came with a registration made through Discord. */
export type VerifiedDiscordIdentity = {
	discordId: string;
	/** When Discord vouched for the email address. */
	emailVerifiedAt: Date;
};

export interface UserRepository {
	create(user: User, discord?: VerifiedDiscordIdentity): Promise<void>;
	findByEmailOrUsername(email: string, username: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	findByUsername(username: string): Promise<User | null>;
	/**
	 * Whether an active account other than `exceptUserId` already uses this name,
	 * ignoring letter case: "Dizzy" and "dizzy" are the same name to players.
	 */
	isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean>;
	findById(id: string): Promise<User | null>;
	update(user: User): Promise<void>;
}
