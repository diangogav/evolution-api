import { describe, expect, it } from "bun:test";

import { SeedStandardCosmetics } from "../../../../../src/modules/catalog/application/SeedStandardCosmetics";
import { STANDARD_COSMETICS } from "../../../../../src/modules/catalog/application/standardCosmetics";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";

function fakeRepository(existing: Cosmetic[]): { repository: CosmeticRepository; saved: Cosmetic[] } {
	const saved: Cosmetic[] = [];
	const repository: CosmeticRepository = {
		findAll: async () => existing,
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
});
