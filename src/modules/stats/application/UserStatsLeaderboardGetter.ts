import { config } from "src/config";

import { LeaderboardSortBy, UserStatsRepository } from "../domain/UserStatsRepository";
import { TierLookup } from "./TierLookup";

export class UserStatsLeaderboardGetter {
	constructor(
		private readonly repository: UserStatsRepository,
		private readonly tierLookup: TierLookup,
	) {}

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

		const rows = leaderboard.map((item) => item.toJson());
		const tiers = await this.tierLookup.forLeaderboardPage({
			rankName: banListName,
			season,
			userIds: rows.map((row) => row.userId),
		});

		return rows.map((row) => ({ ...row, tier: tiers.get(row.userId) ?? null }));
	}
}
