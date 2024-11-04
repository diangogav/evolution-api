import { LeaderboardRepository } from "../domain/LeaderboardRepository";

export class LeaderboardGetter {
	constructor(private readonly repository: LeaderboardRepository) {}

	async get({
		page = 1,
		limit = 100,
		banListName = "Global",
	}: {
		page: number;
		limit: number;
		banListName: string;
	}): Promise<unknown[]> {
		const leaderboard = await this.repository.get({ page, limit, banListName });

		return leaderboard.map((item) => item.toJson());
	}
}
