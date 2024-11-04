import { Server } from "./server/server";
import { Pino } from "./shared/logger/infrastructure/Pino";

(() => {
	const logger = new Pino();
	const server = new Server(logger);
	server.start();
})();
