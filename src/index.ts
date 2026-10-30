import { config } from "./config";
import { cosmeticsDataSource } from "./cosmetics-data-source";
import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
import { createCatalogChangeNotifier } from "./modules/assets/infrastructure/createCatalogChangeNotifier";
import { CosmeticPostgresRepository } from "./modules/catalog/infrastructure/CosmeticPostgresRepository";
import { buildRewardsWorker } from "./modules/rewards/infrastructure/buildRewardsWorker";
import { Server } from "./server/server";
import { Pino } from "./shared/logger/infrastructure/Pino";
import { redisClient } from "./shared/redis/redisClient";

const logger = new Pino();

void (async () => {
	const database = new PostgresTypeORM();
	await database
		.connect()
		.then(() => logger.info("Connected to Postgres (shared schema)"))
		.catch((error) => logger.error(error));
	await cosmeticsDataSource
		.initialize()
		.then(() => {
			logger.info("Connected to Postgres (cosmetics schema)");
			// Not awaited: boot never waits on R2. Until it lands, every asset stays signed.
			void createCatalogChangeNotifier(new CosmeticPostgresRepository(), logger).catalogChanged();
		})
		.catch((error) => logger.error(error));
	await redisClient
		.connect()
		.then(() => logger.info("Connected to Redis"))
		.catch((error) => logger.error(error));
	if (config.rewardsWorker.enabled) {
		buildRewardsWorker(logger).start();
	}
	const server = new Server(logger);
	server.start();
})();
