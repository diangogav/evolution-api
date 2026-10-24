import { EssenceLedgerEntry } from "./EssenceLedgerEntry";

import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

export type { QueryableManager };

export type AppendLedgerEntryResult = "inserted" | "skipped";

export interface EssenceLedgerRepository {
	// Serializes one user's balance-changing writes for the rest of the transaction, so
	// a balance read before a debit cannot be undercut by a concurrent debit.
	lockUser(userId: string, manager: QueryableManager): Promise<void>;
	append(entry: EssenceLedgerEntry, manager?: QueryableManager): Promise<AppendLedgerEntryResult>;
	balanceOf(userId: string, manager?: QueryableManager): Promise<number>;
}
