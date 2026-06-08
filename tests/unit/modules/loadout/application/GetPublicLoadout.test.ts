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

function build(directory: UserDirectory): GetPublicLoadout {
	const loadouts: LoadoutRepository = {
		findByUserId: async (userId) =>
			Loadout.from(userId, [{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: "cosmetic-1" }]),
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
	});

	it("throws NotFound when the username does not exist (client falls back to standard)", async () => {
		const directory: UserDirectory = {
			findUserIdByUsername: async () => null,
		};

		await expect(build(directory).run("ghost")).rejects.toBeInstanceOf(NotFoundError);
	});
});
