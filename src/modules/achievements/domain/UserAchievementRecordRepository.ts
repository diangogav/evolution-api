import { LadderGroup } from "./ladderWins";

export type UserAward = {
	awardId: string;
	id: number;
	code: string | null;
	icon: string;
	name: string;
	description: string;
	labels: string[];
	unlockedAt: Date;
	season: number;
	earnedPoints: number;
};

export interface UserAchievementRecordRepository {
	userExists(userId: string): Promise<boolean>;
	findAwards(userId: string): Promise<UserAward[]>;
	/** Lifetime totals over eligible ranked matches (not annulled, not deleted). */
	findTotals(userId: string): Promise<{ rankedMatches: number; rankedWins: number }>;
	/** Distinct ban list names the user has won an eligible match on. */
	findWinningBanLists(userId: string): Promise<string[]>;
	/** Outcomes of the latest eligible matches, most recent first, bounded. */
	findLatestOutcomes(userId: string): Promise<boolean[]>;
	findLadderGroups(): Promise<LadderGroup[]>;
}
