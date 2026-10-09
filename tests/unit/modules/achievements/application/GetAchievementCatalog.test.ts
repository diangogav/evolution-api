import { describe, expect, it } from "bun:test";

import { GetAchievementCatalog } from "../../../../../src/modules/achievements/application/GetAchievementCatalog";
import { AchievementCatalogRepository } from "../../../../../src/modules/achievements/domain/AchievementCatalogRepository";

const repositoryWith = (
	rows: Awaited<ReturnType<AchievementCatalogRepository["findGameplay"]>>,
): AchievementCatalogRepository => ({ findGameplay: async () => rows });

const base = {
	icon: "sword",
	description: "d",
	earnedPoints: 0,
	updatedAt: new Date("2026-10-09T00:00:00.000Z"),
};

describe("GetAchievementCatalog", () => {
	it("returns the version and the items with their derived requirement", async () => {
		const catalog = await new GetAchievementCatalog(
			repositoryWith([
				{ ...base, id: 1001, code: "first_win", name: "First Blood" },
				{ ...base, id: 1005, code: "format_first_win:TCG", name: "TCG" },
			]),
		).run();

		expect(catalog.version).toMatch(/^[0-9a-f]{64}$/);
		expect(catalog.items).toEqual([
			{
				id: 1001,
				code: "first_win",
				icon: "sword",
				name: "First Blood",
				description: "d",
				earnedPoints: 0,
				requirement: { metric: "rankedWins", target: 1 },
			},
			{
				id: 1005,
				code: "format_first_win:TCG",
				icon: "sword",
				name: "TCG",
				description: "d",
				earnedPoints: 0,
				requirement: { metric: "ladderFirstWin", target: 1, ladder: "TCG" },
			},
		]);
	});

	it("keeps an unknown code with a null requirement instead of failing", async () => {
		const catalog = await new GetAchievementCatalog(
			repositoryWith([{ ...base, id: 9, code: "future_code", name: "Future" }]),
		).run();

		expect(catalog.items[0].requirement).toBeNull();
	});

	it("returns an empty catalog with a stable version", async () => {
		const first = await new GetAchievementCatalog(repositoryWith([])).run();
		const second = await new GetAchievementCatalog(repositoryWith([])).run();

		expect(first.items).toEqual([]);
		expect(first.version).toBe(second.version);
	});
});
