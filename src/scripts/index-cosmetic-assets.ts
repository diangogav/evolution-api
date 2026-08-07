import { cosmeticsDataSource } from "../cosmetics-data-source";
import { createR2AssetUrlSigner } from "../modules/assets/infrastructure/createR2AssetUrlSigner";
import { Cosmetic } from "../modules/catalog/domain/Cosmetic";
import { CosmeticPostgresRepository } from "../modules/catalog/infrastructure/CosmeticPostgresRepository";

/** One-time/backfill indexer. Lists each unindexed R2 prefix once and persists
 * relative keys so normal catalog/loadout requests only perform local signing. */
async function main(): Promise<void> {
	await cosmeticsDataSource.initialize();

	try {
		const repository = new CosmeticPostgresRepository();
		const signer = createR2AssetUrlSigner();
		const cosmetics = await repository.findAll();
		let indexed = 0;
		let skipped = 0;

		for (const cosmetic of cosmetics) {
			if (cosmetic.assetFiles !== null) {
				skipped++;
				continue;
			}

			const signed = await signer.signManifest(cosmetic.assetRef);
			const assetFiles = Object.keys(signed.assets);
			await repository.save(
				Cosmetic.from({
					...cosmetic.toPrimitives(),
					assetFiles,
				}),
			);
			indexed++;
			console.log(`Indexed ${cosmetic.assetRef}: ${assetFiles.length} files`);
		}

		console.log(`Cosmetic asset index complete: ${indexed} indexed, ${skipped} skipped`);
	} finally {
		await cosmeticsDataSource.destroy();
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
