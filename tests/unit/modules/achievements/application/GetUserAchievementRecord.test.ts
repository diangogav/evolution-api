import { describe, expect, it } from "bun:test";

import { GetUserAchievementRecord } from "../../../../../src/modules/achievements/application/GetUserAchievementRecord";
import {
	UserAchievementRecordRepository,
	UserAward,
} from "../../../../../src/modules/achievements/domain/UserAchievementRecordRepository";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

const NOW = new Date("2026-10-09T20:00:00.000Z");

const award: UserAward = {
	awardId: "5b2c0e9e-7a4f-4c3b-9d1e-2f6a8b0c4d3e",
	id: 1001,
	code: "first_win",
	icon: "sword",
	name: "First Blood",
	description: "Win your first ranked match",
	labels: [],
	unlockedAt: new Date("2026-09-01T10:00:00.000Z"),
	season: 7,
	earnedPoints: 0,
};

const repository = (
	overrides: Partial<UserAchievementRecordRepository> = {},
): UserAchievementRecordRepository => ({
	userExists: async () => true,
	findAwards: async () => [],
	findTotals: async () => ({ rankedMatches: 0, rankedWins: 0 }),
	findWinningBanLists: async () => [],
	findLatestOutcomes: async () => [],
	findLadderGroups: async () => [],
	...overrides,
});

const run = (overrides?: Partial<UserAchievementRecordRepository>) =>
	new GetUserAchievementRecord(repository(overrides), () => NOW).run("user-1");

describe("GetUserAchievementRecord", () => {
	it("returns zero counters, all-false ladders and no awards for a user without matches", async () => {
		expect(await run()).toEqual({
			userId: "user-1",
			asOf: "2026-10-09T20:00:00.000Z",
			scope: "lifetime-ranked",
			achievements: [],
			progress: {
				rankedWins: 0,
				rankedMatches: 0,
				currentStreak: 0,
				hasRankedWinByLadder: { TCG: false, OCG: false, Edison: false, JTP: false, Genesys: false },
			},
		});
	});

	it("shapes every award with its award-instance id and ISO unlock date", async () => {
		const record = await run({ findAwards: async () => [award, { ...award, awardId: "other" }] });

		expect(record.achievements).toHaveLength(2);
		expect(record.achievements[0]).toEqual({ ...award, unlockedAt: "2026-09-01T10:00:00.000Z" });
		expect(record.achievements[1].awardId).toBe("other");
	});

	it("takes the totals and computes the streak from the latest outcomes", async () => {
		const record = await run({
			findTotals: async () => ({ rankedMatches: 120, rankedWins: 61 }),
			findLatestOutcomes: async () => [true, true, true, false, true],
		});

		expect(record.progress).toMatchObject({
			rankedMatches: 120,
			rankedWins: 61,
			currentStreak: 3,
		});
	});

	it("resolves ladders from the winning ban lists through the group patterns", async () => {
		const record = await run({
			findWinningBanLists: async () => ["2026.09 TCG", "JTP"],
			findLadderGroups: async () => [{ name: "TCG", patterns: ["* TCG"] }],
		});

		expect(record.progress.hasRankedWinByLadder).toEqual({
			TCG: true,
			OCG: false,
			Edison: false,
			JTP: true,
			Genesys: false,
		});
	});

	it("throws NotFoundError for an unknown user without reading anything else", async () => {
		let reads = 0;
		const counted = async () => {
			reads += 1;

			return [];
		};

		await expect(
			run({ userExists: async () => false, findAwards: counted }),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(reads).toBe(0);
	});
});
