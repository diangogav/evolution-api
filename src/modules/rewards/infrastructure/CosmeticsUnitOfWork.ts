import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { QueryableManager } from "../domain/EssenceLedgerRepository";
import { RewardsUnitOfWork } from "../domain/RewardsUnitOfWork";

// Transaction-scoped advisory lock: released with the commit or rollback, so a crashed
// instance never leaves the worker stuck. Two API instances racing a tick serialize on
// it; the loser skips the tick instead of waiting.
const TRY_LOCK_QUERY = `SELECT pg_try_advisory_xact_lock(hashtextextended('rewards-worker', 0)) AS locked`;

export class CosmeticsUnitOfWork implements RewardsUnitOfWork {
	async run<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T | undefined> {
		return cosmeticsDataSource.transaction(async (txManager) => {
			const manager = txManager as unknown as QueryableManager;
			const [row] = (await manager.query(TRY_LOCK_QUERY)) as Array<{ locked: boolean }>;
			if (!row?.locked) return undefined;
			return work(manager);
		});
	}
}
