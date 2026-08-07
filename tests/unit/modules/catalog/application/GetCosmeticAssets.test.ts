import { describe, expect, it } from "bun:test";

import type { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { GetCosmeticAssets } from "../../../../../src/modules/catalog/application/GetCosmeticAssets";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";
import type { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

const standard = Cosmetic.from({
	id: "standard-playmat",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.STANDARD,
	assetRef: "playmats/standard/",
	displayName: "Standard",
	active: true,
});

function build(cosmetic: Cosmetic | null): GetCosmeticAssets {
	const repository: CosmeticRepository = {
		findAll: async () => (cosmetic ? [cosmetic] : []),
		findById: async () => cosmetic,
		save: async () => undefined,
	};
	const signer: AssetUrlSigner = {
		sign: () => "",
		signMany: () => ({}),
		signManifest: async (prefix) => ({
			assets: { "model.gltf": `signed:${prefix}model.gltf` },
			expiresAt: "2030-01-01T00:00:00.000Z",
		}),
	};
	const entitlements: EntitlementRepository = {
		findByUserId: async () => [],
		save: async () => undefined,
	};
	return new GetCosmeticAssets(repository, signer, new EntitlementsGatekeeper(entitlements));
}

describe("GetCosmeticAssets", () => {
	it("returns one freshly signed manifest with its absolute expiration", async () => {
		const result = await build(standard).run(standard.id, null);

		expect(result).toEqual({
			assets: { "model.gltf": "signed:playmats/standard/model.gltf" },
			assetsExpiresAt: "2030-01-01T00:00:00.000Z",
		});
	});

	it("hides an unknown cosmetic behind not-found", async () => {
		await expect(build(null).run("missing", null)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("hides a cosmetic the caller cannot access", async () => {
		const donor = Cosmetic.from({
			id: "donor-playmat",
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.DONOR,
			assetRef: "playmats/donor/",
			displayName: "Donor",
			active: true,
		});

		await expect(build(donor).run(donor.id, null)).rejects.toBeInstanceOf(NotFoundError);
	});
});
