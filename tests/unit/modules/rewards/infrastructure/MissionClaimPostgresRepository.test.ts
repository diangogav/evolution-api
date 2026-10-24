import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { MissionClaimPostgresRepository } from "../../../../../src/modules/rewards/infrastructure/MissionClaimPostgresRepository";

describe("MissionClaimPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;
	let repository: MissionClaimPostgresRepository;

	beforeEach(() => {
		querySpy = spyOn(cosmeticsDataSource, "query").mockResolvedValue([]);
		repository = new MissionClaimPostgresRepository();
	});

	afterEach(() => {
		mock.restore();
	});

	it("insert reports inserted or skipped from a target-less ON CONFLICT DO NOTHING", async () => {
		querySpy.mockResolvedValueOnce([{ user_id: "user-1" }]);
		expect(await repository.insert("user-1", "m-1", "2026-10-23")).toBe("inserted");
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("INSERT INTO mission_claims");
		expect(sql).toContain("ON CONFLICT DO NOTHING RETURNING");
		expect(params).toEqual(["user-1", "m-1", "2026-10-23"]);

		querySpy.mockResolvedValueOnce([]);
		expect(await repository.insert("user-1", "m-1", "2026-10-23")).toBe("skipped");
	});

	it("findClaimedMissionIds and countClaims filter by user, mission set and period, and skip the query for an empty set", async () => {
		querySpy.mockResolvedValueOnce([{ missionId: "m-1" }]);
		expect(await repository.findClaimedMissionIds("user-1", ["m-1", "m-2"], "2026-W43")).toEqual([
			"m-1",
		]);
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("mission_id = ANY($2::uuid[])");
		expect(params).toEqual(["user-1", ["m-1", "m-2"], "2026-W43"]);

		querySpy.mockResolvedValueOnce([{ count: 2 }]);
		expect(await repository.countClaims("user-1", ["m-1", "m-2"], "2026-10-23")).toBe(2);

		expect(await repository.findClaimedMissionIds("user-1", [], "2026-10-23")).toEqual([]);
		expect(await repository.countClaims("user-1", [], "2026-10-23")).toBe(0);
		expect(querySpy).toHaveBeenCalledTimes(2);
	});

	it("runs through the given manager inside a transaction", async () => {
		const manager = { query: mock(async () => []) };

		await repository.insert("user-1", "m-1", "2026-10-23", manager);

		expect(manager.query).toHaveBeenCalledTimes(1);
		expect(querySpy).not.toHaveBeenCalled();
	});
});
