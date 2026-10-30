import { cosmeticsDataSource } from "../cosmetics-data-source";
import { createCatalogChangeNotifier } from "../modules/assets/infrastructure/createCatalogChangeNotifier";
import { SeedStandardCosmetics } from "../modules/catalog/application/SeedStandardCosmetics";
import { CosmeticPostgresRepository } from "../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { Pino } from "../shared/logger/infrastructure/Pino";

// Seeds the standard cosmetic set. Idempotent — safe to run on every deploy.
async function main(): Promise<void> {
	await cosmeticsDataSource.initialize();

	try {
		const repository = new CosmeticPostgresRepository();
		const result = await new SeedStandardCosmetics(
			repository,
			createCatalogChangeNotifier(repository, new Pino()),
		).run();
		console.log(`Cosmetics seed complete: ${result.created} created, ${result.skipped} skipped`);
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
