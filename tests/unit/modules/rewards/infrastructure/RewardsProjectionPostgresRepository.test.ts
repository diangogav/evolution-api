import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { RewardsProjectionPostgresRepository } from "../../../../../src/modules/rewards/infrastructure/RewardsProjectionPostgresRepository";

describe("RewardsProjectionPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;
	let repository: RewardsProjectionPostgresRepository;

	beforeEach(() => {
		querySpy = spyOn(cosmeticsDataSource, "query").mockResolvedValue([]);
		repository = new RewardsProjectionPostgresRepository();
	});

	afterEach(() => {
		mock.restore();
	});

	it("readCursor returns an empty cursor when the source has no row yet", async () => {
		expect(await repository.readCursor("matches")).toEqual({ lastCreatedAt: null, lastId: null });
	});

	it("advanceCursor upserts the source row", async () => {
		await repository.advanceCursor("matches", {
			lastCreatedAt: new Date("2026-10-23T10:00:05Z"),
			lastId: "row-1",
		});

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("INSERT INTO rewards_cursor");
		expect(sql).toContain("ON CONFLICT (source) DO UPDATE");
		expect(params).toEqual(["matches", new Date("2026-10-23T10:00:05Z"), "row-1"]);
	});

	it("saveProgress upserts each row keyed by user, mission and period and only sets completed_at once", async () => {
		await repository.saveProgress("user-1", [
			{ missionId: "m-1", periodKey: "2026-10-23", value: 3, completed: true },
		]);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("INSERT INTO mission_progress");
		expect(sql).toContain("ON CONFLICT (user_id, mission_id, period_key) DO UPDATE");
		expect(sql).toContain("COALESCE(mission_progress.completed_at");
		expect(params).toEqual(["user-1", "m-1", "2026-10-23", 3, true]);
	});

	it("saveUserState upserts the per-user cross-period state", async () => {
		await repository.saveUserState("user-1", { lastFormat: "Edison", rankedStreak: 2 });

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("INSERT INTO user_reward_state");
		expect(sql).toContain("ON CONFLICT (user_id) DO UPDATE");
		expect(params).toEqual(["user-1", "Edison", 2]);
	});

	it("runs through the given manager when composed inside a transaction", async () => {
		const manager = { query: mock(async () => []) };

		await repository.readCursor("matches", manager);
		await repository.loadUserState("user-1", manager);

		expect(manager.query).toHaveBeenCalledTimes(2);
		expect(querySpy).not.toHaveBeenCalled();
	});
});
