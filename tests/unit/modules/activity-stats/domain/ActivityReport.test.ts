import { describe, expect, it } from "bun:test";

import { activityRange } from "../../../../../src/modules/activity-stats/domain/ActivityRange";
import {
	type ActivityCounts,
	buildActivityReport,
} from "../../../../../src/modules/activity-stats/domain/ActivityReport";

const DAY_1 = new Date("2026-10-27T00:00:00.000Z");
const DAY_2 = new Date("2026-10-28T00:00:00.000Z");
const DAY_3 = new Date("2026-10-29T00:00:00.000Z");
const RANGE = activityRange("day", new Date("2026-10-29T12:00:00.000Z"), 3);

const NO_COUNTS: ActivityCounts = {
	newUsers: [],
	activePlayers: [],
	rankedMatches: [],
	unrankedMatches: [],
};

const ZERO = {
	newUsers: 0,
	activePlayers: 0,
	rankedMatches: 0,
	unrankedMatches: 0,
	evoduelRankedMatches: 0,
	evoduelUnrankedMatches: 0,
	botMatchesExcluded: 0,
};

describe("buildActivityReport", () => {
	it("returns one zeroed bucket per start when nothing happened", () => {
		const report = buildActivityReport(RANGE, NO_COUNTS);

		expect(report.buckets).toEqual([
			{ start: DAY_1, ...ZERO },
			{ start: DAY_2, ...ZERO },
			{ start: DAY_3, ...ZERO },
		]);
		expect(report.byBanList).toEqual([]);
	});

	it("sums ban list rows into bucket totals and keeps empty buckets", () => {
		const report = buildActivityReport(RANGE, {
			newUsers: [{ start: DAY_1, count: 4 }],
			activePlayers: [
				{ start: DAY_1, count: 10 },
				{ start: DAY_3, count: 7 },
			],
			rankedMatches: [
				{ start: DAY_1, banListName: "Edison", matches: 5, evoduelMatches: 2 },
				{ start: DAY_1, banListName: "TCG", matches: 2, evoduelMatches: 1 },
			],
			unrankedMatches: [
				{ start: DAY_1, banListName: "Edison", matches: 3, evoduelMatches: 1, botMatches: 4 },
				{ start: DAY_3, banListName: "TCG", matches: 6, evoduelMatches: 6, botMatches: 0 },
			],
		});

		expect(report.buckets).toEqual([
			{
				start: DAY_1,
				newUsers: 4,
				activePlayers: 10,
				rankedMatches: 7,
				unrankedMatches: 3,
				evoduelRankedMatches: 3,
				evoduelUnrankedMatches: 1,
				botMatchesExcluded: 4,
			},
			{ start: DAY_2, ...ZERO },
			{ ...ZERO, start: DAY_3, activePlayers: 7, unrankedMatches: 6, evoduelUnrankedMatches: 6 },
		]);
	});

	it("merges ranked and unranked counts per ban list, busiest first within a bucket", () => {
		const report = buildActivityReport(RANGE, {
			...NO_COUNTS,
			rankedMatches: [
				{ start: DAY_3, banListName: "TCG", matches: 1, evoduelMatches: 0 },
				{ start: DAY_1, banListName: "Edison", matches: 5, evoduelMatches: 0 },
			],
			unrankedMatches: [
				{ start: DAY_1, banListName: "Edison", matches: 2, evoduelMatches: 0, botMatches: 0 },
				{ start: DAY_1, banListName: "Genesys", matches: 9, evoduelMatches: 0, botMatches: 0 },
			],
		});

		expect(report.byBanList).toEqual([
			{ start: DAY_1, banListName: "Genesys", rankedMatches: 0, unrankedMatches: 9 },
			{ start: DAY_1, banListName: "Edison", rankedMatches: 5, unrankedMatches: 2 },
			{ start: DAY_3, banListName: "TCG", rankedMatches: 1, unrankedMatches: 0 },
		]);
	});

	it("leaves out ban lists that only had bot games", () => {
		const report = buildActivityReport(RANGE, {
			...NO_COUNTS,
			unrankedMatches: [
				{ start: DAY_2, banListName: "Edison", matches: 0, evoduelMatches: 0, botMatches: 3 },
			],
		});

		expect(report.byBanList).toEqual([]);
		expect(report.buckets[1]?.botMatchesExcluded).toBe(3);
	});

	it("ignores rows outside the range", () => {
		const report = buildActivityReport(RANGE, {
			...NO_COUNTS,
			newUsers: [{ start: new Date("2026-10-30T00:00:00.000Z"), count: 99 }],
			rankedMatches: [
				{
					start: new Date("2026-10-26T00:00:00.000Z"),
					banListName: "Edison",
					matches: 99,
					evoduelMatches: 0,
				},
			],
		});

		expect(report.buckets.every((bucket) => bucket.newUsers === 0)).toBe(true);
		expect(report.byBanList).toEqual([]);
	});
});
