import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { GetBestPlayerOfLastCompletedWeek } from "../../../../../src/modules/stats/application/GetBestPlayerOfLastCompletedWeek";
import { GetGlobalStats } from "../../../../../src/modules/stats/application/GetGlobalStats";
import { TierLookup } from "../../../../../src/modules/stats/application/TierLookup";
import { UserStatsFinder } from "../../../../../src/modules/stats/application/UserStatsFinder";
import { UserStatsLeaderboardGetter } from "../../../../../src/modules/stats/application/UserStatsLeaderboardGetter";
import { GlobalStatsRepository } from "../../../../../src/modules/stats/domain/GlobalStats";
import { PeriodUserStats } from "../../../../../src/modules/stats/domain/PeriodUserStats";
import { RatingMembers } from "../../../../../src/modules/stats/domain/RatingMembers";
import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";
import { UserStatsRepository } from "../../../../../src/modules/stats/domain/UserStatsRepository";
import {
	GlobalStatsResponseSchema,
	LeaderboardSchema,
	PlayerOfTheWeekSchema,
	UserStatsSchema,
} from "../../../../../src/modules/stats/infrastructure/StatsSchemas";
import { TierView } from "../../../../../src/modules/tiers/application/dtos/TierView";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

// pg returns bigint window and aggregate columns as strings, whatever the domain types say.
const pgBigint = (value: number): number => String(value) as unknown as number;

const masterTier: TierView = {
	id: "master",
	name: "Master",
	effectivePoints: 52,
	gamesPlayed: 61,
	progress: null,
	rating: 1210,
	peak: 1250,
};

const tierLookup: TierLookup = {
	forPlayer: async () => new Map([["Edison", masterTier]]),
	forLeaderboardPage: async () => new Map([["user-1", masterTier]]),
};

const achievement = {
	id: 7,
	icon: "trophy",
	name: "First win",
	labels: ["season-7"],
	unlockedAt: "2026-09-01T10:00:00.000Z",
	description: "Win a ranked duel",
	earnedPoints: 5,
};

const profile = UserStats.from({
	userId: "user-1",
	username: "player1",
	points: 62,
	wins: 34,
	losses: 21,
	winRate: "61.82",
	position: pgBigint(12),
	achievements: [achievement],
	ratings: RatingMembers.attach(
		[
			{
				rankId: "rank-edison",
				rating: {
					banListName: "Edison",
					rating: 1210,
					gamesPlayed: 61,
					peak: 1250,
					provisional: false,
					rankType: "group",
				},
			},
			{
				rankId: "rank-march",
				rating: {
					banListName: "March 2010 Edison",
					rating: 1100,
					gamesPlayed: 3,
					peak: 1100,
					provisional: true,
					rankType: "banlist",
				},
			},
		],
		[{ rankId: "rank-edison", pattern: "%Edison" }],
	),
});

const leaderboardRow = (userId: string, rating: number | null) =>
	UserStats.from({
		userId,
		username: userId,
		points: 40,
		wins: 20,
		losses: 14,
		winRate: "58.82",
		position: pgBigint(1),
		rating,
		peak: rating,
		provisional: rating === null ? null : false,
	});

const statsRepository: UserStatsRepository = {
	find: async () => profile,
	leaderboard: async () => [leaderboardRow("user-1", 1210), leaderboardRow("user-2", null)],
	getBestPlayerOfLastCompletedWeek: async () => [
		PeriodUserStats.from({
			userId: "user-1",
			username: "player1",
			points: pgBigint(30),
			wins: pgBigint(6),
			losses: pgBigint(1),
			from: "2026-09-14T00:00:00.000Z",
			to: "2026-09-20T00:00:00.000Z",
		}),
	],
};

describe("UserStatsSchema", () => {
	it("accepts the profile UserStatsFinder returns, with a tier per rating", async () => {
		const stats = wire(
			await new UserStatsFinder(statsRepository, tierLookup).find({ userId: "user-1", season: 7 }),
		);

		expect(Value.Check(UserStatsSchema, stats)).toBe(true);
	});

	it("rejects a rating without its tier key", () => {
		expect(Value.Check(UserStatsSchema, wire(profile.toJson()))).toBe(false);
	});
});

describe("LeaderboardSchema", () => {
	it("accepts the bare array of rows UserStatsLeaderboardGetter returns", async () => {
		const rows = wire(
			await new UserStatsLeaderboardGetter(statsRepository, tierLookup).get({
				page: 1,
				limit: 100,
				banListName: "Edison",
				season: 7,
			}),
		);

		expect(Value.Check(LeaderboardSchema, rows)).toBe(true);
		expect(Value.Check(LeaderboardSchema, { data: rows, total: 2 })).toBe(false);
	});
});

describe("PlayerOfTheWeekSchema", () => {
	it("accepts the players GetBestPlayerOfLastCompletedWeek returns and an empty week", async () => {
		const players = wire(await new GetBestPlayerOfLastCompletedWeek(statsRepository).get());

		expect(Value.Check(PlayerOfTheWeekSchema, players)).toBe(true);
		expect(Value.Check(PlayerOfTheWeekSchema, [])).toBe(true);
	});

	it("rejects points that are not a decimal string", async () => {
		const [player] = (await new GetBestPlayerOfLastCompletedWeek(statsRepository).get()).map(wire);

		expect(Value.Check(PlayerOfTheWeekSchema, [{ ...(player as object), points: 30 }])).toBe(false);
		expect(Value.Check(PlayerOfTheWeekSchema, [{ ...(player as object), points: "3.5" }])).toBe(
			false,
		);
	});
});

describe("GlobalStatsResponseSchema", () => {
	const repository: GlobalStatsRepository = {
		getGlobalStats: async () => ({ totalDuels: 1000, activeBanLists: 5, avgDuelsPerBanList: 200 }),
		getDuelsPerSeason: async () => [{ name: "Season 7", value: 1000 }],
		getDuelsPerBanList: async () => [
			{ banListName: "TCG", totalDuels: 600, percentage: 60, popularity: 100 },
		],
		getDailyDuels: async () => [{ date: "2026-09-01", banListName: "TCG", count: 10 }],
	};

	it("accepts what GetGlobalStats returns", async () => {
		const response = wire(await new GetGlobalStats(repository).execute(7));

		expect(Value.Check(GlobalStatsResponseSchema, response)).toBe(true);
	});

	it("rejects a daily entry without its ban list", async () => {
		const response = (await new GetGlobalStats(repository).execute(7)) as {
			dailyDuels: unknown[];
		};

		expect(
			Value.Check(GlobalStatsResponseSchema, {
				...response,
				dailyDuels: [{ date: "2026-09-01", count: 10 }],
			}),
		).toBe(false);
	});
});
