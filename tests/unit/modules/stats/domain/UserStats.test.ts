import { describe, expect, it } from "bun:test";

import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";

describe("UserStats", () => {
	const base = {
		userId: "user-1",
		username: "duelist",
		points: 120,
		wins: 10,
		losses: 4,
		winRate: "71.4",
		position: 3,
	};

	it("includes the ratings array with each banlist entry when ratings are provided", () => {
		const userStats = UserStats.from({
			...base,
			ratings: [
				{ banListName: "Global", rating: 1050, gamesPlayed: 12, peak: 1080, provisional: false },
				{ banListName: "Edison", rating: 980, gamesPlayed: 3, peak: 1020, provisional: true },
			],
		});

		expect(userStats.toJson().ratings).toEqual([
			{ banListName: "Global", rating: 1050, gamesPlayed: 12, peak: 1080, provisional: false },
			{ banListName: "Edison", rating: 980, gamesPlayed: 3, peak: 1020, provisional: true },
		]);
	});

	it("defaults ratings to an empty array when none are provided", () => {
		const userStats = UserStats.from({ ...base });

		expect(userStats.toJson().ratings).toEqual([]);
	});

	it("preserves every previously existing field unchanged alongside the new ratings field", () => {
		const userStats = UserStats.from({ ...base });

		expect(userStats.toJson()).toEqual({
			userId: "user-1",
			username: "duelist",
			points: 120,
			wins: 10,
			losses: 4,
			winRate: "71.4",
			position: 3,
			achievements: [],
			ratings: [],
		});
	});
});
