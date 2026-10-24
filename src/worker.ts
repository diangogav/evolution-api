import { cosmeticsDataSource } from "./cosmetics-data-source";
import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
import { buildRewardsWorker } from "./modules/rewards/infrastructure/buildRewardsWorker";
import { Pino } from "./shared/logger/infrastructure/Pino";

// Standalone rewards worker: `bun run src/worker.ts`. Same code the API runs in-process
// when REWARDS_WORKER_ENABLED=true; use this to drain a backlog without the HTTP server.
// Only one instance makes progress at a time: the others skip ticks on the shared lock.
const logger = new Pino();

void (async () => {
	await new PostgresTypeORM().connect();
	await cosmeticsDataSource.initialize();
	const worker = buildRewardsWorker(logger);
	worker.start();
	const shutdown = () => {
		worker.stop();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
})();
