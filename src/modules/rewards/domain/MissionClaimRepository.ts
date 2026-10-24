import { QueryableManager } from "./EssenceLedgerRepository";

export type InsertClaimResult = "inserted" | "skipped";

// One row per user, mission and period. The unique key is what makes a claim
// idempotent: the second insert of the same claim is skipped, never duplicated.
export interface MissionClaimRepository {
	// Serializes one user's claims inside a period for the rest of the transaction, so
	// the daily-bonus count never runs against another claim that is still uncommitted.
	lockUserPeriod(userId: string, periodKey: string, manager: QueryableManager): Promise<void>;
	findClaimedMissionIds(
		userId: string,
		missionIds: string[],
		periodKey: string,
		manager?: QueryableManager,
	): Promise<string[]>;
	insert(
		userId: string,
		missionId: string,
		periodKey: string,
		manager?: QueryableManager,
	): Promise<InsertClaimResult>;
	countClaims(
		userId: string,
		missionIds: string[],
		periodKey: string,
		manager?: QueryableManager,
	): Promise<number>;
}
