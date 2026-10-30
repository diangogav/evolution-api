import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import type { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import type { CosmeticAssetStorage } from "../../../../../src/modules/assets/domain/CosmeticAssetStorage";
import { GetAdminCosmetics } from "../../../../../src/modules/catalog/application/GetAdminCosmetics";
import { GetCosmeticAssets } from "../../../../../src/modules/catalog/application/GetCosmeticAssets";
import { GetCosmeticsCatalog } from "../../../../../src/modules/catalog/application/GetCosmeticsCatalog";
import { PublishCosmetic } from "../../../../../src/modules/catalog/application/PublishCosmetic";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import {
	AdminCosmeticCatalogSchema,
	CosmeticAssetsSchema,
	CosmeticCatalogSchema,
	PublishedCosmeticSchema,
} from "../../../../../src/modules/catalog/infrastructure/CosmeticSchemas";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";
import type { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const stage = Cosmetic.from({
	id: "stage-1",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.STANDARD,
	assetRef: "playmats/kagura-castle/",
	displayName: "Castillo de Kagura",
	active: true,
	assetFiles: ["background.webp"],
});

const signer: AssetUrlSigner = {
	sign: () => "",
	signMany: () => ({}),
	signManifest: async (prefix, files) => ({
		assets: Object.fromEntries(
			(files ?? ["background.webp"]).map((f) => [f, `signed:${prefix}${f}`]),
		),
		expiresAt: "2030-01-01T00:00:00.000Z",
	}),
};

const emptyEntitlements: EntitlementRepository = {
	findByUserId: async () => [],
	save: async () => undefined,
};

describe("CosmeticCatalogSchema", () => {
	it("accepts the bare array GetCosmeticsCatalog returns", async () => {
		const repository: CosmeticRepository = {
			findAll: async () => [stage],
			findById: async () => stage,
			save: async () => undefined,
		};
		const gatekeeper = new EntitlementsGatekeeper(emptyEntitlements);
		const catalog = await new GetCosmeticsCatalog(repository, signer, gatekeeper)
			.run({}, null)
			.then(wire);

		expect(catalog).toHaveLength(1);
		expect(Value.Check(CosmeticCatalogSchema, catalog)).toBe(true);
	});

	it("rejects a catalog wrapped in pagination metadata", async () => {
		const repository: CosmeticRepository = {
			findAll: async () => [stage],
			findById: async () => stage,
			save: async () => undefined,
		};
		const gatekeeper = new EntitlementsGatekeeper(emptyEntitlements);
		const catalog = await new GetCosmeticsCatalog(repository, signer, gatekeeper)
			.run({}, null)
			.then(wire);

		expect(Value.Check(CosmeticCatalogSchema, { data: catalog, total: 1 })).toBe(false);
	});
});

describe("CosmeticAssetsSchema", () => {
	it("accepts the manifest GetCosmeticAssets returns", async () => {
		const repository: CosmeticRepository = {
			findAll: async () => [stage],
			findById: async () => stage,
			save: async () => undefined,
		};
		const gatekeeper = new EntitlementsGatekeeper(emptyEntitlements);
		const assets = await new GetCosmeticAssets(repository, signer, gatekeeper)
			.run(stage.id, null)
			.then(wire);

		expect(Value.Check(CosmeticAssetsSchema, assets)).toBe(true);
	});
});

describe("AdminCosmeticCatalogSchema", () => {
	it("accepts the bare array GetAdminCosmetics returns, including private fields", async () => {
		const repository: CosmeticRepository = {
			findAll: async () => [stage],
			findById: async () => stage,
			save: async () => undefined,
		};
		const admin = await new GetAdminCosmetics(repository, signer).run().then(wire);

		expect(Value.Check(AdminCosmeticCatalogSchema, admin)).toBe(true);
	});
});

describe("PublishedCosmeticSchema", () => {
	it("accepts what PublishCosmetic returns, without asset URLs", async () => {
		const storage: CosmeticAssetStorage = {
			put: async () => undefined,
			delete: async () => undefined,
		};
		const repository: CosmeticRepository = {
			findAll: async () => [],
			findById: async () => null,
			save: async () => undefined,
		};
		const published = await new PublishCosmetic(repository, storage)
			.run({
				type: CosmeticType.LANE,
				tier: CosmeticTier.STANDARD,
				assetRef: "lanes/bronze/",
				displayName: "Bronce",
				files: [
					{
						name: "plate.json",
						bytes: new TextEncoder().encode(
							JSON.stringify({ version: 1, base: "#c98a3a", accent: "#f0c070" }),
						),
					},
				],
			})
			.then(wire);

		expect(Value.Check(PublishedCosmeticSchema, published)).toBe(true);
	});

	it("accepts a published AMBIENCE cosmetic", async () => {
		const storage: CosmeticAssetStorage = {
			put: async () => undefined,
			delete: async () => undefined,
		};
		const repository: CosmeticRepository = {
			findAll: async () => [],
			findById: async () => null,
			save: async () => undefined,
		};
		const published = await new PublishCosmetic(repository, storage)
			.run({
				type: CosmeticType.AMBIENCE,
				tier: CosmeticTier.STANDARD,
				assetRef: "ambience/embers/",
				displayName: "Brasas",
				files: [
					{
						name: "ambience.json",
						bytes: new TextEncoder().encode(
							JSON.stringify({
								version: 1,
								motes: [{ shape: "ember", colors: ["#ff8a3d"], share: 1 }],
							}),
						),
					},
				],
			})
			.then(wire);

		expect(Value.Check(PublishedCosmeticSchema, published)).toBe(true);
	});
});

describe("public asset URLs never expire", () => {
	const publicAssets = { "render.jpg": "https://cdn.example.com/cosmetics/sleeves/a/render.jpg" };

	it("accepts a null assetsExpiresAt in every catalog schema", () => {
		const entry = {
			id: "c1",
			type: CosmeticType.SLEEVE,
			tier: CosmeticTier.STANDARD,
			displayName: "A",
			assets: publicAssets,
			assetsExpiresAt: null,
		};

		expect(Value.Check(CosmeticCatalogSchema, [entry])).toBe(true);
		expect(Value.Check(CosmeticAssetsSchema, { assets: publicAssets, assetsExpiresAt: null })).toBe(
			true,
		);
		expect(
			Value.Check(AdminCosmeticCatalogSchema, [
				{ ...entry, assetRef: "sleeves/a/", active: true, assetFiles: ["render.jpg"] },
			]),
		).toBe(true);
	});
});
