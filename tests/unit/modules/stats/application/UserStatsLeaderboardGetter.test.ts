import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserStatsLeaderboardGetter } from "../../../../../src/modules/stats/application/UserStatsLeaderboardGetter";
import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";
import { UserStatsRepository } from "../../../../../src/modules/stats/domain/UserStatsRepository";
import { UserStatsPostgresRepository } from "../../../../../src/modules/stats/infrastructure/UserStatsPostgresRepository";
import { UserStatsMother } from "../mothers/UserStatsMother";

describe("LeaderboardGetter", () => {
	let leaderboardGetter: UserStatsLeaderboardGetter;
	let repository: UserStatsRepository;
	let userStats: UserStats[];

	beforeEach(() => {
		repository = new UserStatsPostgresRepository();
		leaderboardGetter = new UserStatsLeaderboardGetter(repository);
		userStats = UserStatsMother.createMany(10);
	});

	it("Should be able to get stats postgres", async () => {
		const params = { page: 1, banListName: "Global", limit: 1 };
		const spy = spyOn(repository, "leaderboard").mockResolvedValue(userStats);
		const response = await leaderboardGetter.get(params);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(params);
		expect(response).toEqual(userStats.map((item) => item.toJson()));
	});
});
