import { describe, expect, it } from "bun:test";

import { SeedStandardCosmetics } from "../../../../../src/modules/catalog/application/SeedStandardCosmetics";
import { STANDARD_COSMETICS } from "../../../../../src/modules/catalog/application/standardCosmetics";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";

function fakeRepository(existing: Cosmetic[]): {
	repository: CosmeticRepository;
	saved: Cosmetic[];
} {
	const saved: Cosmetic[] = [];
	const repository: CosmeticRepository = {
		findAll: async () => existing,
		findById: async () => null,
		save: async (cosmetic) => {
			saved.push(cosmetic);
		},
	};

	return { repository, saved };
}

describe("SeedStandardCosmetics", () => {
	it("seeds every standard cosmetic when the catalog is empty", async () => {
		const { repository, saved } = fakeRepository([]);

		const result = await new SeedStandardCosmetics(repository).run();

		expect(result.created).toBe(STANDARD_COSMETICS.length);
		expect(result.skipped).toBe(0);
		expect(saved).toHaveLength(STANDARD_COSMETICS.length);
		// asset_ref is a folder prefix (multi-file assets live under it)
		for (const cosmetic of saved) {
			expect(cosmetic.assetRef.endsWith("/")).toBe(true);
		}
	});

	it("is idempotent: skips cosmetics already present by asset_ref", async () => {
		const [first] = STANDARD_COSMETICS;
		const existing = [
			Cosmetic.create({
				id: "already-there",
				type: first.type,
				tier: first.tier,
				assetRef: first.assetRef,
				displayName: first.displayName,
			}),
		];
		const { repository, saved } = fakeRepository(existing);

		const result = await new SeedStandardCosmetics(repository).run();

		expect(result.created).toBe(STANDARD_COSMETICS.length - 1);
		expect(result.skipped).toBe(1);
		expect(saved).toHaveLength(STANDARD_COSMETICS.length - 1);
		expect(saved.some((c) => c.assetRef === first.assetRef)).toBe(false);
	});

	it("leaves the exclusive Magma Forge playmat to backoffice publication", () => {
		expect(
			STANDARD_COSMETICS.some((cosmetic) => cosmetic.assetRef === "playmats/magma-forge/"),
		).toBe(false);
	});

	it("ships the three painted 2D stages as STANDARD playmats", () => {
		const stages = STANDARD_COSMETICS.filter((c) =>
			["playmats/kagura-castle/", "playmats/mystic-forest/", "playmats/frog-pond/"].includes(
				c.assetRef,
			),
		);

		expect(stages.map((c) => c.displayName)).toEqual([
			"Castillo de Kagura",
			"Bosque místico",
			"Estanque de la Rana",
		]);
		for (const stage of stages) {
			expect(stage.type).toBe(CosmeticType.PLAYMAT);
			expect(stage.tier).toBe(CosmeticTier.STANDARD);
		}
	});

	// The 3D renderer is gone: companions have nothing to render and glTF playmats
	// have no 2D surface, so neither may come back through a fresh seed.
	describe("retired 3D cosmetics", () => {
		it("ships no COMPANION cosmetic", () => {
			expect(STANDARD_COSMETICS.some((entry) => entry.assetRef.startsWith("companions/"))).toBe(
				false,
			);
			expect(Object.values(CosmeticType)).not.toContain("COMPANION");
		});

		it("ships only the painted 2D stages as playmats", () => {
			const playmats = STANDARD_COSMETICS.filter((entry) => entry.type === CosmeticType.PLAYMAT);
			expect(playmats.map((entry) => entry.assetRef).sort()).toEqual([
				"playmats/arcane/",
				"playmats/frog-pond/",
				"playmats/kagura-castle/",
				"playmats/mossy-ruins/",
				"playmats/mystic-forest/",
			]);
		});
	});

	// Lanes ship as their own cosmetic so a player can pair any stage with any
	// frame; the two art-less choices live in the client and need no row here.
	describe("lanes", () => {
		it("ships the painted lanes as STANDARD cosmetics under their own prefix", () => {
			const lanes = STANDARD_COSMETICS.filter((entry) => entry.type === CosmeticType.LANE);

			expect(lanes.map((entry) => entry.assetRef)).toEqual(["lanes/stone/", "lanes/mossy-ruins/"]);
			for (const lane of lanes) {
				expect(lane.tier).toBe(CosmeticTier.STANDARD);
				expect(lane.displayName.trim()).not.toBe("");
			}
		});

		it("seeds no row for the choices that paint nothing", () => {
			const refs = STANDARD_COSMETICS.map((entry) => entry.assetRef);

			expect(refs).not.toContain("lanes/engraved/");
			expect(refs).not.toContain("lanes/bare/");
		});
	});
});
