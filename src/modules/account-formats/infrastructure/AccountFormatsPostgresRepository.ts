import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { type AccountFormat, storedAccountFormats } from "../domain/AccountFormats";
import type { AccountFormatsRepository } from "../domain/AccountFormatsRepository";

const FIND_QUERY = `SELECT formats FROM users WHERE id = $1 AND deleted_at IS NULL`;

const SAVE_QUERY = `UPDATE users SET formats = $2::text[] WHERE id = $1 AND deleted_at IS NULL RETURNING id`;

type Row = { formats: string[] | null };

export class AccountFormatsPostgresRepository implements AccountFormatsRepository {
	constructor(private readonly manager?: QueryableManager) {}

	async find(userId: string): Promise<AccountFormat[] | null | undefined> {
		const [row] = await runQuery<Row>(FIND_QUERY, [userId], this.manager);
		if (!row) return undefined;
		return row.formats === null ? null : storedAccountFormats(row.formats);
	}

	async save(userId: string, formats: readonly AccountFormat[]): Promise<boolean> {
		const result: unknown = await runQuery(SAVE_QUERY, [userId, [...formats]], this.manager);
		// TypeORM answers UPDATE ... RETURNING with [rows, affectedCount] on Postgres.
		const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
		return Array.isArray(rows) && rows.length > 0;
	}
}
