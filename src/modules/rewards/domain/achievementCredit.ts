import { UnlockedAchievement } from "./AchievementSource";
import { EssenceLedgerEntry, essenceLedgerEntry } from "./EssenceLedgerEntry";

// Essence paid for unlocking an achievement: its catalog essence reward, which is
// independent from the ranked points. The ledger key is the user_achievements row id,
// so re-reading the row can never credit it twice. An achievement with no essence
// reward pays nothing and leaves no ledger row.
export function achievementCredit(unlock: UnlockedAchievement): EssenceLedgerEntry | null {
	const delta = unlock.essenceReward;
	if (delta <= 0) return null;
	return essenceLedgerEntry({
		userId: unlock.userId,
		kind: "achievement",
		referenceKey: unlock.sourceId,
		delta,
	});
}
