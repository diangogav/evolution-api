import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { UserAchievementSource } from "../../../../../src/modules/rewards/infrastructure/UserAchievementSource";

describe("UserAchievementSource", () => {
	let querySpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		querySpy = spyOn(dataSource, "query").mockResolvedValue([]);
	});

	afterEach(() => {
		mock.restore();
	});

	it("maps unlocked achievements with their catalog points, keeping unlocked_at as microsecond UTC text", async () => {
		querySpy.mockResolvedValueOnce([
			{
				sourceId: "ua-1",
				createdAt: "2026-10-23 10:00:05.123456",
				userId: "user-1",
				earnedPoints: 15,
			},
		]);

		const rows = await new UserAchievementSource().fetchAfter(
			{ lastCreatedAt: null, lastId: null },
			100,
			new Date("2026-10-23T10:01:00Z"),
		);

		expect(rows).toEqual([
			{
				sourceId: "ua-1",
				createdAt: "2026-10-23 10:00:05.123456",
				userId: "user-1",
				earnedPoints: 15,
			},
		]);
	});

	it("drains user_achievements joined to the live catalog in (unlocked_at, id) order after the cursor and within the lag bound", async () => {
		await new UserAchievementSource().fetchAfter(
			{ lastCreatedAt: "2026-10-23 10:00:05.123456", lastId: "ua-1" },
			50,
			new Date("2026-10-23T10:01:00Z"),
		);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("FROM user_achievements ua");
		expect(sql).toContain(
			"JOIN achievements a ON a.id = ua.achievement_id AND a.deleted_at IS NULL",
		);
		expect(sql).toContain("to_char(ua.unlocked_at, 'YYYY-MM-DD HH24:MI:SS.US')");
		expect(sql).toContain("(ua.unlocked_at, ua.id) > ($1::timestamp, $2::uuid)");
		expect(sql).toContain("ua.unlocked_at <= $3::timestamp");
		expect(sql).toContain("ORDER BY ua.unlocked_at ASC, ua.id ASC");
		expect(params).toEqual(["2026-10-23 10:00:05.123456", "ua-1", "2026-10-23 10:01:00.000", 50]);
	});

	it("passes a null cursor so the first drain starts from the beginning", async () => {
		await new UserAchievementSource().fetchAfter(
			{ lastCreatedAt: null, lastId: null },
			10,
			new Date(),
		);

		const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(params[0]).toBeNull();
		expect(params[1]).toBeNull();
	});
});
