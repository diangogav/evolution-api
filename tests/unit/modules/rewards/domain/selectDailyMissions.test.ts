import { describe, expect, it } from "bun:test";

import { Mission } from "../../../../../src/modules/rewards/domain/Mission";
import { selectDailyMissions } from "../../../../../src/modules/rewards/domain/selectDailyMissions";

function mission(code: string, overrides: Partial<Mission> = {}): Mission {
	return {
		id: `id-${code}`,
		code,
		name: code,
		description: code,
		period: "daily",
		rule: { metric: "duelsPlayed", target: 3 },
		reward: { type: "essence", amount: 20 },
		active: true,
		sortOrder: 0,
		...overrides,
	};
}

const pool = ["play_3", "win_1", "ranked_play_1", "win_other_format", "win_fast"].map((c) =>
	mission(c),
);

describe("selectDailyMissions", () => {
	it("returns the same three missions for the same day key, in catalog order", () => {
		const first = selectDailyMissions(pool, "2026-10-23");
		const second = selectDailyMissions(pool, "2026-10-23");

		expect(first).toHaveLength(3);
		expect(first.map((m) => m.code)).toEqual(second.map((m) => m.code));
		const codes = pool.map((m) => m.code);
		const indexes = first.map((m) => codes.indexOf(m.code));
		expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
	});

	it("rotates across days so not every day gets the same three", () => {
		const days = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];
		const selections = new Set(
			days.map((day) =>
				selectDailyMissions(pool, day)
					.map((m) => m.code)
					.join(","),
			),
		);

		expect(selections.size).toBeGreaterThan(1);
	});

	it("ignores inactive and weekly missions and never picks duplicates", () => {
		const mixed = [
			...pool,
			mission("weekly_win_10", { period: "weekly" }),
			mission("retired", { active: false }),
		];

		const selected = selectDailyMissions(mixed, "2026-10-23");

		expect(selected).toHaveLength(3);
		expect(new Set(selected.map((m) => m.code)).size).toBe(3);
		expect(selected.every((m) => m.period === "daily" && m.active)).toBe(true);
	});

	it("returns the whole pool when it holds fewer than three daily missions", () => {
		expect(selectDailyMissions(pool.slice(0, 2), "2026-10-23")).toHaveLength(2);
	});
});
