import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import type { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GetMyLoadout } from "../../../../../src/modules/loadout/application/GetMyLoadout";
import { GetPublicLoadout } from "../../../../../src/modules/loadout/application/GetPublicLoadout";
import { Loadout } from "../../../../../src/modules/loadout/domain/Loadout";
import type { LoadoutRepository } from "../../../../../src/modules/loadout/domain/LoadoutRepository";
import type { UserDirectory } from "../../../../../src/modules/loadout/domain/UserDirectory";
import { LoadoutSchema } from "../../../../../src/modules/loadout/infrastructure/LoadoutSchemas";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const sleeve = Cosmetic.from({
	id: "cosmetic-1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/a/",
	displayName: "A",
	active: true,
});

const signer: AssetUrlSigner = {
	sign: () => "",
	signMany: () => ({}),
	signManifest: async (prefix) => ({
		assets: { "render.jpg": `signed:${prefix}render.jpg` },
		expiresAt: "2030-01-01T00:00:00.000Z",
	}),
};

function cosmeticsRepo(cosmetics: Cosmetic[]): CosmeticRepository {
	return {
		findAll: async () => cosmetics,
		findById: async (id) => cosmetics.find((c) => c.id === id) ?? null,
		save: async () => undefined,
	};
}

describe("LoadoutSchema", () => {
	it("accepts the bare array GetMyLoadout returns", async () => {
		const loadouts: LoadoutRepository = {
			findByUserId: async (userId) =>
				Loadout.from(userId, [{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: sleeve.id }]),
			save: async () => undefined,
		};
		const result = await new GetMyLoadout(loadouts, cosmeticsRepo([sleeve]), signer)
			.run("user-1")
			.then(wire);

		expect(Value.Check(LoadoutSchema, result)).toBe(true);
	});

	it("accepts an empty loadout", async () => {
		const loadouts: LoadoutRepository = {
			findByUserId: async (userId) => Loadout.empty(userId),
			save: async () => undefined,
		};
		const result = await new GetMyLoadout(loadouts, cosmeticsRepo([]), signer)
			.run("user-1")
			.then(wire);

		expect(Value.Check(LoadoutSchema, result)).toBe(true);
		expect(result).toEqual([]);
	});

	it("accepts a slot whose cosmetic no longer resolves, assetsExpiresAt absent and assets empty", async () => {
		const loadouts: LoadoutRepository = {
			findByUserId: async (userId) =>
				Loadout.from(userId, [{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: "gone" }]),
			save: async () => undefined,
		};
		const result = await new GetMyLoadout(loadouts, cosmeticsRepo([]), signer)
			.run("user-1")
			.then(wire);

		expect(Value.Check(LoadoutSchema, result)).toBe(true);
		expect(result).toEqual([{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: "gone", assets: {} }]);
	});

	it("accepts GetPublicLoadout's response, the same shape by username", async () => {
		const loadouts: LoadoutRepository = {
			findByUserId: async (userId) =>
				Loadout.from(userId, [{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: sleeve.id }]),
			save: async () => undefined,
		};
		const directory: UserDirectory = {
			findUserIdByUsername: async (username) => (username === "rival" ? "user-rival" : null),
		};
		const result = await new GetPublicLoadout(
			directory,
			new GetMyLoadout(loadouts, cosmeticsRepo([sleeve]), signer),
		)
			.run("rival")
			.then(wire);

		expect(Value.Check(LoadoutSchema, result)).toBe(true);
	});
});
