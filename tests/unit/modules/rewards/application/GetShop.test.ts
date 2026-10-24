import { describe, expect, it } from "bun:test";

import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GetShop } from "../../../../../src/modules/rewards/application/GetShop";
import { ShopCosmetic } from "../../../../../src/modules/rewards/domain/ShopCatalogRepository";

const items: ShopCosmetic[] = [
	{
		id: "s-1",
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.DONOR,
		displayName: "A",
		essencePrice: 800,
	},
	{
		id: "p-1",
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.EXCLUSIVE,
		displayName: "B",
		essencePrice: 1500,
	},
];

describe("GetShop", () => {
	it("lists purchasable cosmetics with their price, marking the ones the user can already use", async () => {
		const useCase = new GetShop(
			{ findPurchasable: async () => items, findPurchasableById: async () => null },
			{ accessFor: async () => ({ canUse: (c: { id: string }) => c.id === "s-1" }) } as never,
		);

		const result = await useCase.run("user-1");

		expect(result).toEqual([
			{
				id: "s-1",
				type: CosmeticType.SLEEVE,
				tier: CosmeticTier.DONOR,
				displayName: "A",
				price: 800,
				owned: true,
			},
			{
				id: "p-1",
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.EXCLUSIVE,
				displayName: "B",
				price: 1500,
				owned: false,
			},
		]);
	});
});
