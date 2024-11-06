import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsLeaderboardGetter {
	constructor(private readonly repository: UserStatsRepository) {}

	async get({
		page = 1,
		limit = 100,
		banListName = "Global",
	}: {
		page: number;
		limit: number;
		banListName: string;
	}): Promise<unknown[]> {
		const leaderboard = await this.repository.leaderboard({ page, limit, banListName });

		return leaderboard.map((item) => item.toJson());
	}
}
