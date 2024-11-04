import { Leaderboard } from "./Leaderboard";

export interface LeaderboardRepository {
	get({ page, limit, banListName }: { page: number; limit: number; banListName: string }): Promise<Leaderboard[]>;
}
