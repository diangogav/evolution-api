import { UnlockedAchievement } from "./AchievementSource";
import { EssenceLedgerEntry, essenceLedgerEntry } from "./EssenceLedgerEntry";

// Essence paid for unlocking an achievement is the catalog's `essence_reward`, a value
// per achievement kept apart from the ranked `earned_points`. The ledger key is the
// user_achievements row id, so re-reading the row can never credit it twice. A reward
// of zero pays nothing and leaves no ledger row.
export function achievementCredit(unlock: UnlockedAchievement): EssenceLedgerEntry | null {
	if (unlock.essenceReward <= 0) return null;
	return essenceLedgerEntry({
		userId: unlock.userId,
		kind: "achievement",
		referenceKey: unlock.sourceId,
		delta: unlock.essenceReward,
	});
}
