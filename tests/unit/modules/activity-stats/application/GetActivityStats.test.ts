import { describe, expect, it } from "bun:test";

import { GetActivityStats } from "../../../../../src/modules/activity-stats/application/GetActivityStats";
import type { ActivityRange } from "../../../../../src/modules/activity-stats/domain/ActivityRange";
import type {
	ActivityCounts,
	ActivityStatsRepository,
} from "../../../../../src/modules/activity-stats/domain/ActivityReport";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

const NOW = new Date("2026-10-29T15:00:00.000Z");

function fakeRepository(counts: Partial<ActivityCounts> = {}) {
	const ranges: ActivityRange[] = [];
	const repository: ActivityStatsRepository = {
		countActivity: async (range) => {
			ranges.push(range);
			return {
				newUsers: [],
				activePlayers: [],
				rankedMatches: [],
				unrankedMatches: [],
				...counts,
			};
		},
	};
	return { repository, ranges };
}

describe("GetActivityStats", () => {
	it("queries the default daily range and answers the zero-filled report as ISO strings", async () => {
		const today = new Date("2026-10-29T00:00:00.000Z");
		const { repository, ranges } = fakeRepository({
			newUsers: [{ start: today, count: 12 }],
			activePlayers: [{ start: today, count: 140 }],
			rankedMatches: [{ start: today, banListName: "Edison", matches: 50, evoduelMatches: 30 }],
			unrankedMatches: [{ start: today, banListName: "Edison", matches: 20, evoduelMatches: 5 }],
		});

		const result = await new GetActivityStats(repository).run({ period: "day", now: NOW });

		expect(ranges).toHaveLength(1);
		expect(ranges[0]?.starts).toHaveLength(30);
		expect(result.period).toBe("day");
		expect(result.from).toBe("2026-09-30T00:00:00.000Z");
		expect(result.to).toBe("2026-10-30T00:00:00.000Z");
		expect(result.buckets).toHaveLength(30);
		expect(result.buckets[0]).toEqual({
			start: "2026-09-30T00:00:00.000Z",
			newUsers: 0,
			activePlayers: 0,
			rankedMatches: 0,
			unrankedMatches: 0,
			evoduelRankedMatches: 0,
			evoduelUnrankedMatches: 0,
		});
		expect(result.buckets[result.buckets.length - 1]).toEqual({
			start: "2026-10-29T00:00:00.000Z",
			newUsers: 12,
			activePlayers: 140,
			rankedMatches: 50,
			unrankedMatches: 20,
			evoduelRankedMatches: 30,
			evoduelUnrankedMatches: 5,
		});
		expect(result.byBanList).toEqual([
			{
				start: "2026-10-29T00:00:00.000Z",
				banListName: "Edison",
				rankedMatches: 50,
				unrankedMatches: 20,
			},
		]);
	});

	it("passes an explicit bucket count through", async () => {
		const { repository, ranges } = fakeRepository();

		const result = await new GetActivityStats(repository).run({
			period: "month",
			buckets: 3,
			now: NOW,
		});

		expect(ranges[0]?.period).toBe("month");
		expect(result.buckets.map((bucket) => bucket.start)).toEqual([
			"2026-08-01T00:00:00.000Z",
			"2026-09-01T00:00:00.000Z",
			"2026-10-01T00:00:00.000Z",
		]);
		expect(result.to).toBe("2026-11-01T00:00:00.000Z");
	});

	it("rejects a bucket count above the period cap without querying", async () => {
		const { repository, ranges } = fakeRepository();
		const useCase = new GetActivityStats(repository);

		await expect(useCase.run({ period: "week", buckets: 54, now: NOW })).rejects.toThrow(
			InvalidArgumentError,
		);
		await expect(useCase.run({ period: "month", buckets: 0, now: NOW })).rejects.toThrow(
			InvalidArgumentError,
		);
		expect(ranges).toHaveLength(0);
	});
});
