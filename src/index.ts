import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
import { Server } from "./server/server";
import { Pino } from "./shared/logger/infrastructure/Pino";

const logger = new Pino();

void (async () => {
	const database = new PostgresTypeORM();
	await database.connect().catch((error) => logger.error(error));
	const server = new Server(logger);
	server.start();
})();
