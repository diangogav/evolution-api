import { Cosmetic } from "../domain/Cosmetic";
import { CosmeticRepository } from "../domain/CosmeticRepository";
import { STANDARD_COSMETICS } from "./standardCosmetics";

// Idempotent seed of the standard cosmetic set. Existing cosmetics are matched by
// their asset_ref (one prefix == one cosmetic), so re-running only inserts what is
// missing.
export class SeedStandardCosmetics {
	constructor(private readonly repository: CosmeticRepository) {}

	async run(): Promise<{ created: number; skipped: number }> {
		const existing = await this.repository.findAll();
		const existingRefs = new Set(existing.map((cosmetic) => cosmetic.assetRef));

		let created = 0;
		let skipped = 0;

		for (const item of STANDARD_COSMETICS) {
			if (existingRefs.has(item.assetRef)) {
				skipped++;
				continue;
			}

			await this.repository.save(
				Cosmetic.create({
					id: crypto.randomUUID(),
					type: item.type,
					tier: item.tier,
					assetRef: item.assetRef,
					displayName: item.displayName,
				}),
			);
			created++;
		}

		return { created, skipped };
	}
}
