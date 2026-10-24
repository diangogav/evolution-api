import { EssenceLedgerEntry } from "./EssenceLedgerEntry";

// Same shape as the points ledger's manager: callers that need several writes to
// land or fail together pass their transaction manager through.
export type QueryableManager = {
	query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
};

export type AppendLedgerEntryResult = "inserted" | "skipped";

export interface EssenceLedgerRepository {
	append(entry: EssenceLedgerEntry, manager?: QueryableManager): Promise<AppendLedgerEntryResult>;
	balanceOf(userId: string, manager?: QueryableManager): Promise<number>;
}
