import { describe, expect, it } from "bun:test";

import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GetMyLoadout } from "../../../../../src/modules/loadout/application/GetMyLoadout";
import { Loadout } from "../../../../../src/modules/loadout/domain/Loadout";
import { LoadoutRepository } from "../../../../../src/modules/loadout/domain/LoadoutRepository";

const sleeve = Cosmetic.from({
	id: "cosmetic-1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/a/",
	displayName: "A",
	active: true,
});

function build(loadout: Loadout) {
	const loadouts: LoadoutRepository = {
		findByUserId: async () => loadout,
		save: async () => undefined,
	};
	const cosmetics: CosmeticRepository = {
		findAll: async () => [sleeve],
		findById: async (id) => (id === sleeve.id ? sleeve : null),
		save: async () => undefined,
	};
	const signer: AssetUrlSigner = {
		sign: () => "",
		signMany: () => ({}),
		signManifest: async (prefix) => ({ "render.jpg": `signed:${prefix}render.jpg` }),
	};

	return new GetMyLoadout(loadouts, cosmetics, signer);
}

describe("GetMyLoadout", () => {
	it("returns each equipped slot with its signed asset manifest", async () => {
		const loadout = Loadout.from("user-1", [
			{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: "cosmetic-1" },
		]);

		const result = await build(loadout).run("user-1");

		expect(result).toHaveLength(1);
		expect(result[0].cosmeticType).toBe(CosmeticType.SLEEVE);
		expect(result[0].cosmeticId).toBe("cosmetic-1");
		expect(result[0].assets).toEqual({ "render.jpg": "signed:sleeves/a/render.jpg" });
	});

	it("returns an empty loadout for a user with nothing equipped", async () => {
		const result = await build(Loadout.empty("user-1")).run("user-1");

		expect(result).toEqual([]);
	});
});
