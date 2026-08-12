import { describe, expect, it } from "bun:test";

import type { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { GetAdminCosmetics } from "../../../../../src/modules/catalog/application/GetAdminCosmetics";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";

describe("GetAdminCosmetics", () => {
	it("returns signed manifests for private catalog previews", async () => {
		const magma = Cosmetic.create({
			id: "magma-id",
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "playmats/magma-forge/",
			displayName: "Magma Forge",
			assetFiles: ["magma-forge.glb"],
		});
		const repository: CosmeticRepository = {
			findAll: async () => [magma],
			findById: async () => magma,
			save: async () => undefined,
		};
		const signer: AssetUrlSigner = {
			sign: () => "",
			signMany: () => ({}),
			signManifest: async (prefix, files) => ({
				assets: { "magma-forge.glb": `https://r2.test/${prefix}${files?.[0]}` },
				expiresAt: "2026-08-11T20:00:00.000Z",
			}),
		};

		const result = await new GetAdminCosmetics(repository, signer).run();

		expect(result).toEqual([
			{
				id: "magma-id",
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.EXCLUSIVE,
				assetRef: "playmats/magma-forge/",
				displayName: "Magma Forge",
				active: true,
				assetFiles: ["magma-forge.glb"],
				assets: {
					"magma-forge.glb": "https://r2.test/playmats/magma-forge/magma-forge.glb",
				},
				assetsExpiresAt: "2026-08-11T20:00:00.000Z",
			},
		]);
	});

	it("surfaces a companion animation profile for editing", async () => {
		const companion = Cosmetic.create({
			id: "companion-1",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "companions/golden-dragon/",
			displayName: "Golden Dragon",
			animation: { motion: { preset: "hover", intensity: 0.8 } },
			assetFiles: ["dragon.glb"],
		});
		const repository: CosmeticRepository = {
			findAll: async () => [companion],
			findById: async () => companion,
			save: async () => undefined,
		};
		const signer: AssetUrlSigner = {
			sign: () => "",
			signMany: () => ({}),
			signManifest: async () => ({
				assets: { "dragon.glb": "https://r2.test/dragon.glb" },
				expiresAt: "2026-08-11T20:00:00.000Z",
			}),
		};

		const [result] = await new GetAdminCosmetics(repository, signer).run();

		expect(result?.animation?.motion).toEqual({ preset: "hover", intensity: 0.8 });
	});
});
