import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningTickUnitOfWork } from "../domain/LightningTickUnitOfWork";

// Same contract as the event run worker's unit of work, with its own lock: one instance at a
// time runs the lightning tick, the others skip. Savepoints nest under one name, which
// Postgres resolves to the innermost, so a pairing pass can roll back inside a tournament.
const SAVEPOINT = "lightning_tick_item";
const TRY_LOCK_QUERY = `SELECT pg_try_advisory_xact_lock(hashtextextended('lightning-worker', 0)) AS locked`;

export class LightningUnitOfWork implements LightningTickUnitOfWork {
	async run<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T | undefined> {
		return cosmeticsDataSource.transaction(async (txManager) => {
			const manager = txManager as unknown as QueryableManager;
			const [row] = (await manager.query(TRY_LOCK_QUERY)) as Array<{ locked: boolean }>;
			if (!row?.locked) return undefined;
			return work(manager);
		});
	}

	async savepoint<T>(manager: QueryableManager, work: () => Promise<T>): Promise<T> {
		await manager.query(`SAVEPOINT ${SAVEPOINT}`);
		try {
			const result = await work();
			await manager.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
			return result;
		} catch (error) {
			await manager.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
			await manager.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
			throw error;
		}
	}
}
