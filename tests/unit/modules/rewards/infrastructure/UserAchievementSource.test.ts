import { describe, expect, it, mock } from "bun:test";

import { UserAchievementSource } from "../../../../../src/modules/rewards/infrastructure/UserAchievementSource";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

const window = {
	notBefore: new Date("2026-10-16T10:01:00Z"),
	notAfter: new Date("2026-10-23T10:00:55Z"),
};

describe("UserAchievementSource", () => {
	it("maps uncredited unlocks with their catalog essence reward", async () => {
		const manager = managerReturning([{ sourceId: "ua-1", userId: "user-1", essenceReward: "50" }]);

		const rows = await new UserAchievementSource().fetchUncredited(window, 100, manager);

		expect(rows).toEqual([{ sourceId: "ua-1", userId: "user-1", essenceReward: 50 }]);
	});

	it("reads paying unlocks inside the window that have no achievement ledger row, oldest first, on the tick's transaction", async () => {
		const manager = managerReturning([]);

		await new UserAchievementSource().fetchUncredited(window, 50, manager);

		const [sql, params] = manager.query.mock.calls[0];
		const query = compact(sql);
		expect(query).toContain("FROM user_achievements ua");
		expect(query).toContain(
			"JOIN achievements a ON a.id = ua.achievement_id AND a.deleted_at IS NULL AND a.essence_reward > 0",
		);
		expect(query).toContain("ua.unlocked_at >= $1::timestamp AND ua.unlocked_at <= $2::timestamp");
		expect(query).toContain(
			"NOT EXISTS ( SELECT 1 FROM essence_ledger el WHERE el.user_id = ua.user_id AND el.kind = 'achievement' AND el.reference_key = ua.id::text )",
		);
		expect(query).toContain("ORDER BY ua.unlocked_at ASC, ua.id ASC LIMIT $3");
		expect(params).toEqual(["2026-10-16 10:01:00.000", "2026-10-23 10:00:55.000", 50]);
	});
});
