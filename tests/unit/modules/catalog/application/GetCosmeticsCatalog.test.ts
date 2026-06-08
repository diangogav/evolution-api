import { describe, expect, it } from "bun:test";

import { GetCosmeticsCatalog } from "../../../../../src/modules/catalog/application/GetCosmeticsCatalog";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";

const sleeve = Cosmetic.from({
	id: "1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/a/",
	displayName: "A",
	active: true,
});
const playmat = Cosmetic.from({
	id: "2",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.REGISTERED,
	assetRef: "playmats/b/",
	displayName: "B",
	active: true,
});
const inactive = Cosmetic.from({
	id: "3",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/c/",
	displayName: "C",
	active: false,
});

function catalogOf(cosmetics: Cosmetic[]): GetCosmeticsCatalog {
	const repository: CosmeticRepository = {
		findAll: async () => cosmetics,
		save: async () => undefined,
	};
	const signer: AssetUrlSigner = {
		sign: () => "",
		signMany: () => ({}),
		signManifest: async (prefix) => ({ "render.jpg": `signed:${prefix}render.jpg` }),
	};

	return new GetCosmeticsCatalog(repository, signer);
}

describe("GetCosmeticsCatalog", () => {
	it("returns active cosmetics with their signed asset manifest", async () => {
		const result = await catalogOf([sleeve, playmat]).run();

		expect(result).toHaveLength(2);
		expect(result[0].assets).toEqual({ "render.jpg": "signed:sleeves/a/render.jpg" });
	});

	it("excludes inactive cosmetics", async () => {
		const result = await catalogOf([sleeve, inactive]).run();

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("1");
	});

	it("filters by type", async () => {
		const result = await catalogOf([sleeve, playmat]).run({ type: CosmeticType.PLAYMAT });

		expect(result).toHaveLength(1);
		expect(result[0].type).toBe(CosmeticType.PLAYMAT);
	});

	it("filters by tier", async () => {
		const result = await catalogOf([sleeve, playmat]).run({ tier: CosmeticTier.STANDARD });

		expect(result).toHaveLength(1);
		expect(result[0].tier).toBe(CosmeticTier.STANDARD);
	});
});
