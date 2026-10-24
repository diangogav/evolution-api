import { QueryableManager } from "./EssenceLedgerRepository";

// Runs several repository writes as one transaction. Unlike the worker's unit of work
// it takes no lock: concurrent claims serialize on the claim table's unique key.
export interface TransactionRunner {
	run<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T>;
}
