import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { ShopItemSchema } from "../../../../../src/modules/rewards/infrastructure/ShopSchemas";

describe("ShopItemSchema", () => {
	const item = {
		id: "c1",
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.EXCLUSIVE,
		displayName: "A",
		price: 100,
		owned: false,
		assets: { "render.jpg": "https://signed/render.jpg" },
	};

	it("accepts signed assets with an ISO expiry", () => {
		expect(
			Value.Check(ShopItemSchema, { ...item, assetsExpiresAt: "2030-01-01T00:00:00.000Z" }),
		).toBe(true);
	});

	it("accepts public assets that never expire", () => {
		expect(Value.Check(ShopItemSchema, { ...item, assetsExpiresAt: null })).toBe(true);
	});
});
