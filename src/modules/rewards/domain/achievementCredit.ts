import { UnlockedAchievement } from "./AchievementSource";
import { EssenceLedgerEntry, essenceLedgerEntry } from "./EssenceLedgerEntry";

export const ACHIEVEMENT_ESSENCE_MULTIPLIER = 2;

// Essence paid for unlocking an achievement: twice its ranked points. The ledger key
// is the user_achievements row id, so re-reading the row can never credit it twice.
// A zero-point achievement pays nothing and leaves no ledger row.
export function achievementCredit(unlock: UnlockedAchievement): EssenceLedgerEntry | null {
	const delta = unlock.earnedPoints * ACHIEVEMENT_ESSENCE_MULTIPLIER;
	if (delta <= 0) return null;
	return essenceLedgerEntry({
		userId: unlock.userId,
		kind: "achievement",
		referenceKey: unlock.sourceId,
		delta,
	});
}
