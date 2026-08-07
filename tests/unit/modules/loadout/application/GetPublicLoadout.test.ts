import { describe, expect, it } from "bun:test";

import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GetMyLoadout } from "../../../../../src/modules/loadout/application/GetMyLoadout";
import { GetPublicLoadout } from "../../../../../src/modules/loadout/application/GetPublicLoadout";
import { Loadout } from "../../../../../src/modules/loadout/domain/Loadout";
import { LoadoutRepository } from "../../../../../src/modules/loadout/domain/LoadoutRepository";
import { UserDirectory } from "../../../../../src/modules/loadout/domain/UserDirectory";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

const sleeve = Cosmetic.from({
	id: "cosmetic-1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/a/",
	displayName: "A",
	active: true,
});
const companionAnimation = {
	rigFile: "Rig_Medium_General.glb",
	clips: { idle: "Idle_A", attack: "Throw" },
};
const companion = Cosmetic.from({
	id: "companion-1",
	type: CosmeticType.COMPANION,
	tier: CosmeticTier.STANDARD,
	assetRef: "companions/kaykit-warrior/",
	displayName: "Warrior",
	active: true,
	animation: companionAnimation,
});

const catalog = new Map<string, Cosmetic>([
	[sleeve.id, sleeve],
	[companion.id, companion],
]);

function build(directory: UserDirectory, equipped: Cosmetic = sleeve): GetPublicLoadout {
	const loadouts: LoadoutRepository = {
		findByUserId: async (userId) =>
			Loadout.from(userId, [{ cosmeticType: equipped.type, cosmeticId: equipped.id }]),
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

	return new GetPublicLoadout(directory, new GetMyLoadout(loadouts, cosmetics, signer));
}

describe("GetPublicLoadout", () => {
	it("returns the loadout of an existing user by username", async () => {
		const directory: UserDirectory = {
			findUserIdByUsername: async (username) => (username === "rival" ? "user-rival" : null),
		};

		const result = await build(directory).run("rival");

		expect(result).toHaveLength(1);
		expect(result[0].assets).toEqual({ "render.jpg": "signed:sleeves/a/render.jpg" });
		expect(result[0].assetsExpiresAt).toBe("2030-01-01T00:00:00.000Z");
	});

	it("carries the COMPANION animation descriptor through the public gate (opponent/spectator render)", async () => {
		const directory: UserDirectory = {
			findUserIdByUsername: async (username) => (username === "rival" ? "user-rival" : null),
		};

		const result = await build(directory, companion).run("rival");

		expect(result).toHaveLength(1);
		expect(result[0].cosmeticType).toBe(CosmeticType.COMPANION);
		expect(result[0].animation).toEqual(companionAnimation);
	});

	it("throws NotFound when the username does not exist (client falls back to standard)", async () => {
		const directory: UserDirectory = {
			findUserIdByUsername: async () => null,
		};

		await expect(build(directory).run("ghost")).rejects.toBeInstanceOf(NotFoundError);
	});
});
