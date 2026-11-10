import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { PlayerDirectory } from "../domain/PlayerDirectory";

// The shared `users` table, same database, read-only.
const USERNAMES_QUERY = `SELECT id, username FROM users WHERE id = ANY($1)`;

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
}
