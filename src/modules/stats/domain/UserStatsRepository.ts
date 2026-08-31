import { PeriodUserStats } from "./PeriodUserStats";
import { UserStats } from "./UserStats";

export type LeaderboardSortBy = "points" | "rating";

export interface UserStatsRepository {
	find(userId: string, banListName: string, season: number): Promise<UserStats | null>;
	leaderboard({
		page,
		limit,
		banListName,
		season,
		sortBy,
	}: {
		page: number;
		limit: number;
		banListName: string;
		season: number;
		sortBy?: LeaderboardSortBy;
	}): Promise<UserStats[]>;
	getBestPlayerOfLastCompletedWeek(): Promise<PeriodUserStats[]>;
}
