import { UserProfileRole } from "../../../evolution-types/src/types/UserProfileRole";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { ChatAuthor, PlayerDirectory } from "../domain/PlayerDirectory";

// The shared `users` table, same database, read-only.
const USERNAMES_QUERY = `SELECT id, username FROM users WHERE id = ANY($1)`;
const AUTHORS_QUERY = `SELECT id, username, role = $2 AS admin FROM users WHERE id = ANY($1)`;

export class PlayerDirectoryPostgresRepository implements PlayerDirectory {
	async usernamesOf(userIds: string[], manager?: QueryableManager): Promise<Map<string, string>> {
		if (userIds.length === 0) return new Map();
		const rows = await runQuery<{ id: string; username: string }>(
			USERNAMES_QUERY,
			[userIds],
			manager,
		);
		return new Map(rows.map((row) => [row.id, row.username]));
	}

	async authorsOf(userIds: string[], manager?: QueryableManager): Promise<Map<string, ChatAuthor>> {
		if (userIds.length === 0) return new Map();
		const rows = await runQuery<{ id: string; username: string; admin: boolean }>(
			AUTHORS_QUERY,
			[userIds, UserProfileRole.ADMIN],
			manager,
		);
		return new Map(rows.map((row) => [row.id, { username: row.username, admin: row.admin }]));
	}
}
