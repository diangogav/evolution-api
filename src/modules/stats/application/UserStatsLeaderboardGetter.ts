import { config } from "src/config";

import { LeaderboardSortBy, UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsLeaderboardGetter {
	constructor(private readonly repository: UserStatsRepository) {}

	async get({
		page = 1,
		limit = 100,
		banListName = "Global",
		season = config.season,
		sortBy,
	}: {
		page: number;
		limit: number;
		banListName: string;
		season: number;
		sortBy?: LeaderboardSortBy;
	}): Promise<unknown[]> {
		const leaderboard = await this.repository.leaderboard({
			page,
			limit,
			banListName,
			season,
			sortBy,
		});

		return leaderboard.map((item) => item.toJson());
	}
}
