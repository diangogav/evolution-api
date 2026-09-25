import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { UserStatsFinder } from "../../../../../src/modules/stats/application/UserStatsFinder";
import { TierLookup } from "../../../../../src/modules/stats/application/TierLookup";
import { RatingSummary, UserStats } from "../../../../../src/modules/stats/domain/UserStats";
import { UserStatsRepository } from "../../../../../src/modules/stats/domain/UserStatsRepository";
import { TierView } from "../../../../../src/modules/tiers/application/dtos/TierView";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UserStatsMother } from "../mothers/UserStatsMother";
import { config } from "src/config";

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

const rookieTier: TierView = {
	id: "rookie",
	name: "Rookie",
	effectivePoints: 2,
	gamesPlayed: 1,
	progress: {
		nextTierId: "bronze",
		unit: "games",
		current: 1,
		target: 5,
		distinctOpponentWins: null,
	},
};

const rating = (banListName: string, rankType: RatingSummary["rankType"]): RatingSummary => ({
	banListName,
	rating: 1180,
	gamesPlayed: 34,
	peak: 1210,
	provisional: false,
	rankType,
});

const statsWith = (ratings: RatingSummary[]): UserStats =>
	UserStats.from({
		userId: "user-1",
		username: "player1",
		points: 40,
		wins: 20,
		losses: 14,
		winRate: "58.82",
		position: 3,
		ratings,
	});

describe("UserStatsFinder", () => {
	let userStatsFinder: UserStatsFinder;
	let repository: UserStatsRepository;
	let tierLookup: TierLookup;
	let userStats: UserStats;

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
		userStatsFinder = new UserStatsFinder(repository, tierLookup);
		userStats = UserStatsMother.create();
	});

	it("Should return user stats when they exist for the given user and ban list", async () => {
		spyOn(repository, "find").mockResolvedValue(userStats);
		const response = await userStatsFinder.find({
			userId: userStats.userId,
			banListName: "Global",
			season: config.season,
		});
		expect(repository.find).toHaveBeenCalledTimes(1);
		expect(repository.find).toHaveBeenCalledWith(userStats.userId, "Global", config.season);
		expect(response).toEqual(userStats.toJson());
	});

	it("Should default to the 'Global' ban list when none is specified", async () => {
		spyOn(repository, "find").mockResolvedValue(userStats);
		const response = await userStatsFinder.find({
			userId: userStats.userId,
			season: config.season,
		});
		expect(repository.find).toHaveBeenCalledTimes(1);
		expect(repository.find).toHaveBeenCalledWith(userStats.userId, "Global", config.season);
		expect(response).toEqual(userStats.toJson());
	});

	it("Should throw NotFoundError when stats are not found for the given user", async () => {
		spyOn(repository, "find").mockResolvedValue(null);
		await expect(
			userStatsFinder.find({ userId: userStats.userId, season: config.season }),
		).rejects.toThrow(new NotFoundError(`Stats for user with id ${userStats.userId} not found.`));
		expect(tierLookup.forPlayer).not.toHaveBeenCalled();
	});

	it("Should attach each rating's tier by ban list name and null where the lookup has none", async () => {
		const ratings = [
			rating("TCG", "banlist"),
			rating("Global", "global"),
			rating("Edison", "banlist"),
		];
		userStats = statsWith(ratings);
		spyOn(repository, "find").mockResolvedValue(userStats);
		tierLookup.forPlayer = mock(
			async () =>
				new Map<string, TierView>([
					["TCG", goldTier],
					["Edison", rookieTier],
				]),
		);

		const response = (await userStatsFinder.find({
			userId: userStats.userId,
			banListName: "TCG",
			season: config.season,
		})) as { ratings: (RatingSummary & { tier: TierView | null })[] };

		expect(tierLookup.forPlayer).toHaveBeenCalledWith({
			userId: userStats.userId,
			season: config.season,
			rankNames: ["TCG", "Global", "Edison"],
		});
		expect(response.ratings).toEqual([
			{ ...ratings[0], tier: goldTier },
			{ ...ratings[1], tier: null },
			{ ...ratings[2], tier: rookieTier },
		]);
	});

	it("Should keep every pre-existing field, its value and its order, and only append tier to each rating", async () => {
		const ratings = [rating("TCG", "banlist"), rating("Global", "global")];
		userStats = statsWith(ratings);
		spyOn(repository, "find").mockResolvedValue(userStats);
		tierLookup.forPlayer = mock(async () => new Map<string, TierView>([["TCG", goldTier]]));
		const before = userStats.toJson();

		const response = (await userStatsFinder.find({
			userId: userStats.userId,
			season: config.season,
		})) as Record<string, unknown> & { ratings: Record<string, unknown>[] };

		expect(Object.keys(response)).toEqual(Object.keys(before));
		const { ratings: _ratings, ...rest } = response;
		const { ratings: _beforeRatings, ...beforeRest } = before;
		expect(rest).toEqual(beforeRest);
		expect(response.ratings.map((entry) => Object.keys(entry))).toEqual(
			before.ratings.map((entry) => [...Object.keys(entry), "tier"]),
		);
	});

	it("Should propagate a tier lookup failure instead of hiding it behind a null tier", async () => {
		userStats = statsWith([rating("TCG", "banlist")]);
		spyOn(repository, "find").mockResolvedValue(userStats);
		tierLookup.forPlayer = mock(async () => {
			throw new Error("points_ledger unavailable");
		});

		await expect(
			userStatsFinder.find({ userId: userStats.userId, season: config.season }),
		).rejects.toThrow("points_ledger unavailable");
	});
});
