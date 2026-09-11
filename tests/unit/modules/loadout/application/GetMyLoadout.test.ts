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
const avatar = Cosmetic.from({
	id: "avatar-1",
	type: CosmeticType.AVATAR,
	tier: CosmeticTier.STANDARD,
	assetRef: "avatars/kagura/",
	displayName: "Kagura",
	active: true,
});

const catalog = new Map<string, Cosmetic>([
	[sleeve.id, sleeve],
	[avatar.id, avatar],
]);

function build(loadout: Loadout) {
	const loadouts: LoadoutRepository = {
		findByUserId: async () => loadout,
		save: async () => undefined,
	};
	const cosmetics: CosmeticRepository = {
		findAll: async () => [...catalog.values()],
		findById: async (id) => catalog.get(id) ?? null,
		save: async () => undefined,
	};
	const signer: AssetUrlSigner = {
		sign: () => "",
		signMany: () => ({}),
		signManifest: async (prefix) => ({
			assets: { "render.jpg": `signed:${prefix}render.jpg` },
			expiresAt: "2030-01-01T00:00:00.000Z",
		}),
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
		expect(result[0].assetsExpiresAt).toBe("2030-01-01T00:00:00.000Z");
	});

	it("returns an empty loadout for a user with nothing equipped", async () => {
		const result = await build(Loadout.empty("user-1")).run("user-1");

		expect(result).toEqual([]);
	});

	it("includes signed assets and no animation field for an equipped AVATAR", async () => {
		const loadout = Loadout.from("user-1", [
			{ cosmeticType: CosmeticType.AVATAR, cosmeticId: "avatar-1" },
		]);

		const result = await build(loadout).run("user-1");

		expect(result).toHaveLength(1);
		expect(result[0].cosmeticType).toBe(CosmeticType.AVATAR);
		expect(result[0].assets).toEqual({ "render.jpg": "signed:avatars/kagura/render.jpg" });
		expect(result[0]).not.toHaveProperty("animation");
	});
});
