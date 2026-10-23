import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { EssenceLedgerEntry } from "../domain/EssenceLedgerEntry";
import {
	AppendLedgerEntryResult,
	EssenceLedgerRepository,
	QueryableManager,
} from "../domain/EssenceLedgerRepository";

// Target-less ON CONFLICT DO NOTHING: forward compatible with the
// (user_id, kind, reference_key) unique index without naming it.
const APPEND_QUERY = `INSERT INTO essence_ledger (user_id, kind, reference_key, delta)
	VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`;

const BALANCE_QUERY = `SELECT COALESCE(SUM(delta), 0)::int AS balance
	FROM essence_ledger WHERE user_id = $1`;

export class EssenceLedgerPostgresRepository implements EssenceLedgerRepository {
	async append(
		entry: EssenceLedgerEntry,
		manager?: QueryableManager,
	): Promise<AppendLedgerEntryResult> {
		const params = [entry.userId, entry.kind, entry.referenceKey, entry.delta];
		const inserted = await this.query<{ id: string }>(APPEND_QUERY, params, manager);
		return inserted.length > 0 ? "inserted" : "skipped";
	}

	async balanceOf(userId: string, manager?: QueryableManager): Promise<number> {
		const rows = await this.query<{ balance: number | null }>(BALANCE_QUERY, [userId], manager);
		return rows[0]?.balance ?? 0;
	}

	private async query<T>(sql: string, params: unknown[], manager?: QueryableManager): Promise<T[]> {
		const runner = manager ?? cosmeticsDataSource;
		return (await runner.query(sql, params)) as T[];
	}
}
