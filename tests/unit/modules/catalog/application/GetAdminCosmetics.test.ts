import { describe, expect, it } from "bun:test";

import type { AssetUrlSigner } from "../../../../../src/modules/catalog/domain/AssetUrlSigner";
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
			assetFiles: ["background.webp"],
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
				assets: { "background.webp": `https://r2.test/${prefix}${files?.[0]}` },
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
				assetFiles: ["background.webp"],
				essencePrice: null,
				bots: [],
				prizeOf: [],
				assets: {
					"background.webp": "https://r2.test/playmats/magma-forge/background.webp",
				},
				assetsExpiresAt: "2026-08-11T20:00:00.000Z",
			},
		]);
	});

	it("exposes no animation field on admin rows", async () => {
		const stage = Cosmetic.create({
			id: "stage-1",
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/kagura-castle/",
			displayName: "Castillo de Kagura",
			assetFiles: ["background.webp"],
		});
		const repository: CosmeticRepository = {
			findAll: async () => [stage],
			findById: async () => stage,
			save: async () => undefined,
		};
		const signer: AssetUrlSigner = {
			sign: () => "",
			signMany: () => ({}),
			signManifest: async () => ({
				assets: { "background.webp": "https://r2.test/background.webp" },
				expiresAt: "2026-08-11T20:00:00.000Z",
			}),
		};

		const [result] = await new GetAdminCosmetics(repository, signer).run();

		expect(result).not.toHaveProperty("animation");
	});

	it("says which bots wear a cosmetic and which events give it away", async () => {
		const sleeve = Cosmetic.create({
			id: "sleeve-id",
			type: CosmeticType.SLEEVE,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "sleeves/graveyard/",
			displayName: "Graveyard",
			assetFiles: ["render.jpg"],
		});
		const repository: CosmeticRepository = {
			findAll: async () => [sleeve],
			findById: async () => null,
			save: async () => undefined,
		};
		const signer: AssetUrlSigner = {
			sign: () => "",
			signMany: () => ({}),
			signManifest: async () => ({ assets: {}, expiresAt: null }),
		};
		const usage = new Map([
			[
				"sleeve-id",
				{ bots: ["Lich"], prizeOf: [{ eventId: "halloween-2026", name: "Halloween Gauntlet" }] },
			],
		]);

		const [result] = await new GetAdminCosmetics(repository, signer, {
			usage: async () => usage,
		}).run();

		expect(result?.bots).toEqual(["Lich"]);
		expect(result?.prizeOf).toEqual([{ eventId: "halloween-2026", name: "Halloween Gauntlet" }]);
	});
});
