import { describe, expect, it } from "bun:test";

import { SeedStandardCosmetics } from "../../../../../src/modules/catalog/application/SeedStandardCosmetics";
import {
	KAYKIT_COMPANIONS,
	STANDARD_COSMETICS,
} from "../../../../../src/modules/catalog/application/standardCosmetics";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
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

	// Assets are uploaded to R2, so KAYKIT_COMPANIONS now ships in the active seed. These
	// assertions lock the seed data shape and that the companions are actually enabled.
	describe("KAYKIT_COMPANIONS", () => {
		it("registers all four companion entries in the active seed", () => {
			expect(KAYKIT_COMPANIONS).toHaveLength(4);
			for (const entry of KAYKIT_COMPANIONS) {
				expect(STANDARD_COSMETICS).toContain(entry);
			}
			// Mage ships as the client's offline default, yet it is still hosted server-side
			// so it is equippable and visible to opponents like every other companion.
			expect(STANDARD_COSMETICS.map((entry) => entry.assetRef)).toContain(
				"companions/kaykit-mage/",
			);
		});

		it("each entry is a COMPANION folder prefix with a usable animation descriptor", () => {
			for (const entry of KAYKIT_COMPANIONS) {
				expect(entry.type).toBe(CosmeticType.COMPANION);
				expect(entry.assetRef.endsWith("/")).toBe(true);
				expect(entry.animation?.rigFile).toBeTruthy();
				expect(Object.keys(entry.animation?.clips ?? {}).length).toBeGreaterThan(0);
			}
		});

		it("builds a COMPANION cosmetic carrying its animation through Cosmetic.create (seed path)", () => {
			for (const entry of KAYKIT_COMPANIONS) {
				const cosmetic = Cosmetic.create({
					id: crypto.randomUUID(),
					type: entry.type,
					tier: entry.tier,
					assetRef: entry.assetRef,
					displayName: entry.displayName,
					animation: entry.animation,
				});

				expect(cosmetic.type).toBe(CosmeticType.COMPANION);
				expect(cosmetic.animation).toEqual(entry.animation);
			}
		});
	});
});
