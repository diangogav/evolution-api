import { UserStats } from "./UserStats";

export interface UserStatsRepository {
	find(userId: string, banListName: string): Promise<UserStats | null>;
	leaderboard({
		page,
		limit,
		banListName,
	}: {
		page: number;
		limit: number;
		banListName: string;
	}): Promise<UserStats[]>;
}
