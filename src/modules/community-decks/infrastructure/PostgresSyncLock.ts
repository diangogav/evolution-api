import type { DataSource } from "typeorm";

import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import type { SyncLock } from "../domain/SyncLock";

const TRY_LOCK = `SELECT pg_try_advisory_lock(hashtextextended('community-decks-sync', 0)) AS locked`;
const UNLOCK = `SELECT pg_advisory_unlock(hashtextextended('community-decks-sync', 0))`;

// A sync spends minutes on HTTP, so it holds a session lock on one dedicated connection
// instead of a transaction-scoped one: only one instance talks to YGOPRODeck at a time.
export class PostgresSyncLock implements SyncLock {
	constructor(
		private readonly dataSource: Pick<DataSource, "createQueryRunner"> = cosmeticsDataSource,
	) {}

	async runExclusive<T>(work: () => Promise<T>): Promise<T | undefined> {
		const runner = this.dataSource.createQueryRunner();
		await runner.connect();
		try {
			const [row] = (await runner.query(TRY_LOCK)) as Array<{ locked: boolean }>;
			if (!row?.locked) return undefined;
			try {
				return await work();
			} finally {
				await runner.query(UNLOCK);
			}
		} finally {
			await runner.release();
		}
	}
}
