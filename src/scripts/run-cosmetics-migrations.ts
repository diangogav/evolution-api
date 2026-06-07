import { cosmeticsDataSource } from "../cosmetics-data-source";

// Manual migration runner for the cosmetics schema — run on deploy when cosmetics
// migrations change. Programmatic on purpose: the API runs on Bun, while the shared
// submodule uses the TypeORM CLI via ts-node. Migrations are written by hand, so
// `migration:generate` is not needed — only run / revert.
async function main(): Promise<void> {
	const shouldRevert = process.argv.includes("--revert");

	await cosmeticsDataSource.initialize();

	try {
		if (shouldRevert) {
			await cosmeticsDataSource.undoLastMigration();
		} else {
			await cosmeticsDataSource.runMigrations();
		}
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
