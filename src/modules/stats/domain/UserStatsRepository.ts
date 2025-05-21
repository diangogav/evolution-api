import { PeriodUserStats } from "./PeriodUserStats";
import { UserStats } from "./UserStats";

export interface UserStatsRepository {
	find(userId: string, banListName: string, season: number): Promise<UserStats | null>;
	leaderboard({
		page,
		limit,
		banListName,
		season,
	}: {
		page: number;
		limit: number;
		banListName: string;
		season: number;
	}): Promise<UserStats[]>;
	getBestPlayerOfLastCompletedWeek(): Promise<PeriodUserStats[]>;
}
