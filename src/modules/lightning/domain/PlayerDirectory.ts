import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

// Usernames for standings and opponents; the shared user table is read, never written.
export interface PlayerDirectory {
	usernamesOf(userIds: string[], manager?: QueryableManager): Promise<Map<string, string>>;
}
