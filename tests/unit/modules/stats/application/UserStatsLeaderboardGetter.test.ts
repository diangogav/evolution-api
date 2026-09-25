import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { config } from "src/config";

import { TierLookup } from "../../../../../src/modules/stats/application/TierLookup";
import { UserStatsLeaderboardGetter } from "../../../../../src/modules/stats/application/UserStatsLeaderboardGetter";
import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";
import { UserStatsRepository } from "../../../../../src/modules/stats/domain/UserStatsRepository";
import { TierView } from "../../../../../src/modules/tiers/application/dtos/TierView";
import { UserStatsMother } from "../mothers/UserStatsMother";

const goldTier: TierView = {
	id: "gold",
	name: "Gold",
	effectivePoints: 17,
	gamesPlayed: 34,
	progress: {
		nextTierId: "platinum",
		unit: "points",
		current: 17,
		target: 25,
		distinctOpponentWins: { current: 4, required: 5 },
	},
};

const masterTier: TierView = {
	id: "master",
	name: "Master",
	effectivePoints: 47,
	gamesPlayed: 61,
	progress: null,
	rating: 1320,
	peak: 1350,
};

describe("LeaderboardGetter", () => {
	const params = { page: 1, banListName: "Global", limit: 1, season: config.season };
	let leaderboardGetter: UserStatsLeaderboardGetter;
	let repository: UserStatsRepository;
	let tierLookup: TierLookup;
	let userStats: UserStats[];

	beforeEach(() => {
		repository = {
			find: async () => null,
			leaderboard: async () => [],
			getBestPlayerOfLastCompletedWeek: async () => [],
		};
		tierLookup = {
			forPlayer: mock(async () => new Map<string, TierView>()),
			forLeaderboardPage: mock(async () => new Map<string, TierView>()),
		};
		leaderboardGetter = new UserStatsLeaderboardGetter(repository, tierLookup);
		userStats = UserStatsMother.createMany(10);
	});

	it("Should be able to get stats postgres", async () => {
		spyOn(repository, "leaderboard").mockResolvedValue(userStats);
		const response = await leaderboardGetter.get(params);
		expect(repository.leaderboard).toHaveBeenCalledTimes(1);
		expect(repository.leaderboard).toHaveBeenCalledWith(params);
		expect(response).toEqual(userStats.map((item) => ({ ...item.toJson(), tier: null })));
	});

	it("Should attach each row's tier by user id and null where the lookup has none", async () => {
		const [first, second, third] = userStats;
		spyOn(repository, "leaderboard").mockResolvedValue([first, second, third]);
		tierLookup.forLeaderboardPage = mock(
			async () =>
				new Map<string, TierView>([
					[first.userId, masterTier],
					[third.userId, goldTier],
				]),
		);

		const response = await leaderboardGetter.get({
			page: 2,
			limit: 3,
			banListName: "TCG",
			season: 7,
		});

		expect(tierLookup.forLeaderboardPage).toHaveBeenCalledWith({
			rankName: "TCG",
			season: 7,
			userIds: [first.userId, second.userId, third.userId],
		});
		expect(response).toEqual([
			{ ...first.toJson(), tier: masterTier },
			{ ...second.toJson(), tier: null },
			{ ...third.toJson(), tier: goldTier },
		]);
	});

	it("Should keep every pre-existing field, its value and its order, and only append tier to each row", async () => {
		spyOn(repository, "leaderboard").mockResolvedValue(userStats);
		tierLookup.forLeaderboardPage = mock(
			async () => new Map<string, TierView>([[userStats[0].userId, goldTier]]),
		);
		const before = userStats.map((item) => item.toJson());

		const response = (await leaderboardGetter.get(params)) as Record<string, unknown>[];

		expect(response.map((row) => Object.keys(row))).toEqual(
			before.map((row) => [...Object.keys(row), "tier"]),
		);
		expect(response.map(({ tier: _tier, ...rest }) => rest)).toEqual(before);
	});

	it("Should look up an empty page with no user ids and return no rows", async () => {
		spyOn(repository, "leaderboard").mockResolvedValue([]);

		expect(await leaderboardGetter.get(params)).toEqual([]);

		expect(tierLookup.forLeaderboardPage).toHaveBeenCalledWith({
			rankName: "Global",
			season: config.season,
			userIds: [],
		});
	});

	it("Should propagate a tier lookup failure instead of hiding it behind a null tier", async () => {
		spyOn(repository, "leaderboard").mockResolvedValue(userStats);
		tierLookup.forLeaderboardPage = mock(async () => {
			throw new Error("points_ledger unavailable");
		});

		await expect(leaderboardGetter.get(params)).rejects.toThrow("points_ledger unavailable");
	});
});
