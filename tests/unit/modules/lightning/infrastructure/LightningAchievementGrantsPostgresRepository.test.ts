import { describe, expect, it, mock } from "bun:test";

import { LightningAchievementGrantsPostgresRepository } from "../../../../../src/modules/lightning/infrastructure/LightningAchievementGrantsPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

describe("LightningAchievementGrantsPostgresRepository", () => {
	it("reads live catalog rows by code with their essence reward", async () => {
		const manager = managerReturning([
			{ id: "1103", code: "LIGHTNING_CHAMPION", name: "Champion", essence_reward: "200" },
		]);

		const rows = await new LightningAchievementGrantsPostgresRepository().findByCodes(
			["LIGHTNING_CHAMPION", "LIGHTNING_FIRST"],
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("WHERE code = ANY($1) AND deleted_at IS NULL");
		expect(params).toEqual([["LIGHTNING_CHAMPION", "LIGHTNING_FIRST"]]);
		expect(rows).toEqual([
			{ id: 1103, code: "LIGHTNING_CHAMPION", name: "Champion", essenceReward: 200 },
		]);
	});

	it("skips the queries for no codes and no ids", async () => {
		const manager = managerReturning();
		const repository = new LightningAchievementGrantsPostgresRepository();

		expect(await repository.findByCodes([], manager)).toEqual([]);
		expect(await repository.heldAchievementIds("u-1", [], manager)).toEqual(new Set());
		expect(manager.query).not.toHaveBeenCalled();
	});

	it("takes the duel server's per-player advisory lock", async () => {
		const manager = managerReturning([]);

		await new LightningAchievementGrantsPostgresRepository().lockPlayer("u-1", manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(sql).toBe(
			"SELECT pg_advisory_xact_lock(hashtextextended('user_achievements:' || $1, 0))",
		);
		expect(params).toEqual(["u-1"]);
	});

	it("reads the held achievements in every season", async () => {
		const manager = managerReturning([{ achievement_id: "1101" }, { achievement_id: 1102 }]);

		const held = await new LightningAchievementGrantsPostgresRepository().heldAchievementIds(
			"u-1",
			[1101, 1102, 1103],
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("WHERE user_id = $1 AND achievement_id = ANY($2)");
		expect(sql).not.toContain("season");
		expect(params).toEqual(["u-1", [1101, 1102, 1103]]);
		expect(held).toEqual(new Set([1101, 1102]));
	});

	it("inserts the row the way the duel server does, with no labels and a UTC unlock time", async () => {
		const manager = managerReturning([]);

		await new LightningAchievementGrantsPostgresRepository().grant(
			{
				userId: "u-1",
				achievementId: 1103,
				season: 7,
				unlockedAt: new Date("2026-11-10T21:05:00.123Z"),
			},
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"INSERT INTO user_achievements (id, user_id, achievement_id, labels, unlocked_at, season) VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamp, $5)",
		);
		expect(params).toEqual(["u-1", 1103, "[]", "2026-11-10 21:05:00.123", 7]);
	});
});
