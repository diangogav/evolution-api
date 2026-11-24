import { runQuery } from "../../../shared/persistence/runQuery";
import { UsernameChange, UsernameChangeRepository } from "../domain/UsernameChange";

const LAST_CHANGE_AT = `SELECT MAX("changed_at") AS "changed_at" FROM "username_changes" WHERE "user_id" = $1`;

const INSERT = `INSERT INTO "username_changes"
("id", "user_id", "previous_username", "new_username", "changed_at")
VALUES ($1, $2, $3, $4, $5)`;

export class UsernameChangePostgresRepository implements UsernameChangeRepository {
	async lastChangeAt(userId: string): Promise<Date | null> {
		const rows = await runQuery<{ changed_at: Date | null }>(LAST_CHANGE_AT, [userId]);
		return rows[0]?.changed_at ?? null;
	}

	async record(change: UsernameChange): Promise<void> {
		await runQuery(INSERT, [
			crypto.randomUUID(),
			change.userId,
			change.previousUsername,
			change.newUsername,
			change.changedAt,
		]);
	}
}
