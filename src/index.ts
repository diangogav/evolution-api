import { cosmeticsDataSource } from "./cosmetics-data-source";
import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
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
		.then(() => logger.info("Connected to Postgres (cosmetics schema)"))
		.catch((error) => logger.error(error));
	await redisClient
		.connect()
		.then(() => logger.info("Connected to Redis"))
		.catch((error) => logger.error(error));
	const server = new Server(logger);
	server.start();
})();
