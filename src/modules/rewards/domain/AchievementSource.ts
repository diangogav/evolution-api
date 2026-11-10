import { QueryableManager } from "./EssenceLedgerRepository";

// One user_achievements row joined to its catalog entry, as the worker sees it.
export type UnlockedAchievement = {
	sourceId: string;
	userId: string;
	essenceReward: number;
};

// Unlock instants the worker looks at: from `notBefore` (how far back a missed credit is
// still repaired) up to `notAfter` (the worker's lag).
export type AchievementWindow = {
	notBefore: Date;
	notAfter: Date;
};

// A table of unlocked achievements read by what is still owed rather than past a cursor:
// a writer may commit a row stamped earlier than rows already credited, and a cursor
// would have moved past it for good.
export interface AchievementSource {
	readonly name: string;
	// Unlocks in the window that pay essence and have no achievement ledger row yet,
	// oldest first.
	fetchUncredited(
		window: AchievementWindow,
		limit: number,
		manager: QueryableManager,
	): Promise<UnlockedAchievement[]>;
}
