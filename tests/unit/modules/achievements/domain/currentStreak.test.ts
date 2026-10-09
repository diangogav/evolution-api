import { describe, expect, it } from "bun:test";

import { currentStreak } from "../../../../../src/modules/achievements/domain/currentStreak";

describe("currentStreak", () => {
	it("counts the wins at the head of the latest-first outcomes", () => {
		expect(currentStreak([true, true, false, true])).toBe(2);
	});

	it("is zero when the latest match is a loss or there are no matches", () => {
		expect(currentStreak([false, true, true])).toBe(0);
		expect(currentStreak([])).toBe(0);
	});

	it("is the whole window when there is no loss in it", () => {
		expect(currentStreak([true, true, true])).toBe(3);
	});
});
