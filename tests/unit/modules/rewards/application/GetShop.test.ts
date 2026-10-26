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
		assetRef: "sleeves/a/",
		assetFiles: ["render.jpg", "preview.jpg"],
	},
	{
		id: "p-1",
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.EXCLUSIVE,
		displayName: "B",
		essencePrice: 1500,
		assetRef: "playmats/b/",
		assetFiles: null,
	},
];

const EXPIRES = "2026-10-27T00:00:00.000Z";
const signer = {
	signManifest: async (prefix: string, files?: readonly string[]) => ({
		assets: Object.fromEntries(
			(files ?? ["background.webp"]).map((f) => [f, `https://cdn/${prefix}${f}?sig=1`]),
		),
		expiresAt: EXPIRES,
	}),
};

describe("GetShop", () => {
	it("lists purchasable cosmetics with their price and signed previews, marking the ones the user can already use", async () => {
		const useCase = new GetShop(
			{ findPurchasable: async () => items, findPurchasableById: async () => null },
			{ accessFor: async () => ({ canUse: (c: { id: string }) => c.id === "s-1" }) } as never,
			signer,
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
				assets: {
					"render.jpg": "https://cdn/sleeves/a/render.jpg?sig=1",
					"preview.jpg": "https://cdn/sleeves/a/preview.jpg?sig=1",
				},
				assetsExpiresAt: EXPIRES,
			},
			{
				id: "p-1",
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.EXCLUSIVE,
				displayName: "B",
				price: 1500,
				owned: false,
				assets: { "background.webp": "https://cdn/playmats/b/background.webp?sig=1" },
				assetsExpiresAt: EXPIRES,
			},
		]);
	});
});
