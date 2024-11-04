import { Server } from "./server/server";
import { PostgresTypeORM } from "./shared/database/postgres/infrastructure/PostgresTypeORM";
import { Pino } from "./shared/logger/infrastructure/Pino";

const logger = new Pino();

void (async () => {
	const database = new PostgresTypeORM(logger);
	await database.connect().catch((error) => logger.error(error));
	const server = new Server(logger);
	server.start();
})();
