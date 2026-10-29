import { describe, expect, it } from "bun:test";

import {
	activityRange,
	BUCKET_LIMITS,
} from "../../../../../src/modules/activity-stats/domain/ActivityRange";

const iso = (dates: readonly Date[]) => dates.map((date) => date.toISOString());

describe("activityRange", () => {
	it("defaults a daily range to the last 30 UTC days, ending after today", () => {
		const range = activityRange("day", new Date("2026-10-29T23:30:00.000Z"));

		expect(range.starts).toHaveLength(30);
		expect(range.from.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(range.to.toISOString()).toBe("2026-10-30T00:00:00.000Z");
		expect(iso(range.starts.slice(-2))).toEqual([
			"2026-10-28T00:00:00.000Z",
			"2026-10-29T00:00:00.000Z",
		]);
	});

	it("starts weeks on Monday and defaults to 12 of them", () => {
		// 2026-10-29 is a Thursday; its week started on Monday 2026-10-26.
		const range = activityRange("week", new Date("2026-10-29T10:00:00.000Z"));

		expect(range.starts).toHaveLength(12);
		expect(range.starts[range.starts.length - 1]?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
		expect(range.to.toISOString()).toBe("2026-11-02T00:00:00.000Z");
		expect(range.from.toISOString()).toBe("2026-08-10T00:00:00.000Z");
		expect(range.starts.every((start) => start.getUTCDay() === 1)).toBe(true);
	});

	it("keeps a Sunday inside the week that started the previous Monday", () => {
		const range = activityRange("week", new Date("2026-11-01T23:59:59.000Z"), 1);

		expect(iso(range.starts)).toEqual(["2026-10-26T00:00:00.000Z"]);
	});

	it("defaults to 12 calendar months and rolls over the year", () => {
		const range = activityRange("month", new Date("2026-01-15T12:00:00.000Z"));

		expect(range.starts).toHaveLength(12);
		expect(range.from.toISOString()).toBe("2025-02-01T00:00:00.000Z");
		expect(range.starts[range.starts.length - 1]?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(range.to.toISOString()).toBe("2026-02-01T00:00:00.000Z");
	});

	it("honors an explicit bucket count in ascending order", () => {
		const range = activityRange("day", new Date("2026-10-29T05:00:00.000Z"), 3);

		expect(iso(range.starts)).toEqual([
			"2026-10-27T00:00:00.000Z",
			"2026-10-28T00:00:00.000Z",
			"2026-10-29T00:00:00.000Z",
		]);
	});

	it("accepts each period's cap", () => {
		const now = new Date("2026-10-29T00:00:00.000Z");

		expect(activityRange("day", now, 92).starts).toHaveLength(92);
		expect(activityRange("week", now, 53).starts).toHaveLength(53);
		expect(activityRange("month", now, 24).starts).toHaveLength(24);
	});

	it("rejects a count above the cap, below one, or fractional", () => {
		const now = new Date("2026-10-29T00:00:00.000Z");

		expect(() => activityRange("day", now, 93)).toThrow(RangeError);
		expect(() => activityRange("week", now, 54)).toThrow(RangeError);
		expect(() => activityRange("month", now, 25)).toThrow(RangeError);
		expect(() => activityRange("day", now, 0)).toThrow(RangeError);
		expect(() => activityRange("day", now, 1.5)).toThrow(RangeError);
	});

	it("publishes the defaults and caps per period", () => {
		expect(BUCKET_LIMITS).toEqual({
			day: { default: 30, max: 92 },
			week: { default: 12, max: 53 },
			month: { default: 12, max: 24 },
		});
	});
});
