import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

export type ChatAuthor = { username: string; admin: boolean };

// Usernames for standings, opponents and chat authors; the shared user table is read, never
// written.
export interface PlayerDirectory {
	usernamesOf(userIds: string[], manager?: QueryableManager): Promise<Map<string, string>>;
	/** Usernames with the current admin role, in one read for a whole page of messages. */
	authorsOf(userIds: string[], manager?: QueryableManager): Promise<Map<string, ChatAuthor>>;
}
