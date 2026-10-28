import { cosmeticsDataSource } from "./cosmetics-data-source";
import { PostgresTypeORM } from "./evolution-types/src/PostgresTypeORM";
import { buildEventRunWorker } from "./modules/event-run/infrastructure/buildEventRun";
import { buildRewardsWorker } from "./modules/rewards/infrastructure/buildRewardsWorker";
import { Pino } from "./shared/logger/infrastructure/Pino";

// Standalone workers: `bun run src/worker.ts`. Same code the API runs in-process when
// REWARDS_WORKER_ENABLED / EVENT_RUN_WORKER_ENABLED are true; use this to drain a backlog
// without the HTTP server. Only one instance of each worker makes progress at a time: the
// others skip ticks on that worker's lock.
const logger = new Pino();

void (async () => {
	await new PostgresTypeORM().connect();
	await cosmeticsDataSource.initialize();
	const workers = [buildRewardsWorker(logger), buildEventRunWorker(logger)];
	for (const worker of workers) worker.start();
	const shutdown = () => {
		for (const worker of workers) worker.stop();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
})();
