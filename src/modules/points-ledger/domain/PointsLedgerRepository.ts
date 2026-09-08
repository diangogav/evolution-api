import { PointsLedgerEntry, PointsLedgerKind } from "./PointsLedgerEntry";

// Mirrors QueryableManager from rating; every method takes an optional
// manager so unit 7 can compose these calls inside its own transaction.
export type QueryableManager = { query: (sql: string, parameters?: unknown[]) => Promise<unknown> };

export type InsertLedgerEntryResult = "inserted" | "skipped";

export interface PointsLedgerRepository {
	findAppliedEntries(gameId: string, manager?: QueryableManager): Promise<PointsLedgerEntry[]>;
	findEntriesForKey(
		userId: string,
		rankId: string,
		season: number,
		manager?: QueryableManager,
	): Promise<PointsLedgerEntry[]>;
	insertEntry(
		entry: PointsLedgerEntry,
		manager?: QueryableManager,
	): Promise<InsertLedgerEntryResult>;
	countByKind(
		gameId: string,
		userId: string,
		rankId: string,
		kind: PointsLedgerKind,
		manager?: QueryableManager,
	): Promise<number>;
	findAchievementPoints(
		userId: string,
		rankName: string,
		season: number,
		manager?: QueryableManager,
	): Promise<number>;
	reprojectPlayerStats(
		userId: string,
		rankId: string,
		season: number,
		achievementPoints: number,
		manager?: QueryableManager,
	): Promise<void>;
}
