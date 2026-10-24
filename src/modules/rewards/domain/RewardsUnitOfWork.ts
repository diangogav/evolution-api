import { QueryableManager } from "./EssenceLedgerRepository";

// Runs one tick's writes atomically under the worker's exclusive lock. Resolves to
// undefined, without running the work, when another instance holds the lock.
export interface RewardsUnitOfWork {
	run<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T | undefined>;
}
