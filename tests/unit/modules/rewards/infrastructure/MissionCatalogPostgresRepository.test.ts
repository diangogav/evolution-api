import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { MissionCatalogPostgresRepository } from "../../../../../src/modules/rewards/infrastructure/MissionCatalogPostgresRepository";

describe("MissionCatalogPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		querySpy = spyOn(cosmeticsDataSource, "query").mockResolvedValue([]);
	});

	afterEach(() => {
		mock.restore();
	});

	it("findActive maps rows to missions ordered by sort order and parses rule and reward", async () => {
		querySpy.mockResolvedValueOnce([
			{
				id: "11111111-1111-4111-8111-111111111111",
				code: "play_3",
				name: { en: "Play 3 duels", es: "Juega 3 duelos" },
				description: { en: "Play 3 duels today", es: "Juega 3 duelos hoy" },
				period: "daily",
				rule: { metric: "duelsPlayed", target: 3 },
				reward: { type: "essence", amount: 20 },
				active: true,
				sortOrder: 1,
			},
		]);

		const missions = await new MissionCatalogPostgresRepository().findActive();

		expect(missions).toEqual([
			{
				id: "11111111-1111-4111-8111-111111111111",
				code: "play_3",
				name: { en: "Play 3 duels", es: "Juega 3 duelos" },
				description: { en: "Play 3 duels today", es: "Juega 3 duelos hoy" },
				period: "daily",
				rule: { metric: "duelsPlayed", target: 3 },
				reward: { type: "essence", amount: 20 },
				active: true,
				sortOrder: 1,
			},
		]);
		const [sql] = querySpy.mock.calls[0] as [string];
		expect(sql).toContain("FROM mission_catalog");
		expect(sql).toContain("WHERE active = true");
		expect(sql).toContain("ORDER BY sort_order");
	});
});
