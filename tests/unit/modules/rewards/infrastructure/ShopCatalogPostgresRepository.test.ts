import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { ShopCatalogPostgresRepository } from "../../../../../src/modules/rewards/infrastructure/ShopCatalogPostgresRepository";

describe("ShopCatalogPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;
	let repository: ShopCatalogPostgresRepository;

	beforeEach(() => {
		querySpy = spyOn(cosmeticsDataSource, "query").mockResolvedValue([]);
		repository = new ShopCatalogPostgresRepository();
	});

	afterEach(() => {
		mock.restore();
	});

	it("findPurchasable lists only active cosmetics that carry a price", async () => {
		await repository.findPurchasable();

		const [sql] = querySpy.mock.calls[0] as [string];
		expect(sql).toContain("FROM cosmetics");
		expect(sql).toContain("active = true AND essence_price IS NOT NULL");
		expect(sql).toContain('essence_price AS "essencePrice"');
	});

	it("findPurchasableById applies the same filter and returns null when absent", async () => {
		expect(await repository.findPurchasableById("c-1")).toBeNull();
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("id = $1 AND active = true AND essence_price IS NOT NULL");
		expect(params).toEqual(["c-1"]);
	});
});
