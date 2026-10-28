import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

// Runs on the caller's transaction when given one, on the cosmetics DataSource otherwise.
// The duel server's `reserved_duels` lives in the same database, so it is read the same way.
export async function runQuery<T>(
	sql: string,
	params: unknown[],
	manager?: QueryableManager,
): Promise<T[]> {
	const runner = manager ?? cosmeticsDataSource;
	return (await runner.query(sql, params)) as T[];
}
