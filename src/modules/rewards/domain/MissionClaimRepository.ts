import { QueryableManager } from "./EssenceLedgerRepository";

export type InsertClaimResult = "inserted" | "skipped";

// One row per user, mission and period. The unique key is what makes a claim
// idempotent: the second insert of the same claim is skipped, never duplicated.
export interface MissionClaimRepository {
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
