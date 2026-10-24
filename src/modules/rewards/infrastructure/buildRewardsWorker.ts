import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ProcessRewardsTick } from "../application/ProcessRewardsTick";
import { CosmeticsUnitOfWork } from "./CosmeticsUnitOfWork";
import { MissionCatalogPostgresRepository } from "./MissionCatalogPostgresRepository";
import { RankedMatchSource } from "./RankedMatchSource";
import { RewardsProjectionPostgresRepository } from "./RewardsProjectionPostgresRepository";
import { RewardsWorker } from "./RewardsWorker";

// Composition root for the worker, shared by the API process and the standalone entrypoint.
export function buildRewardsWorker(logger: Logger): RewardsWorker {
	const tick = new ProcessRewardsTick(
		[new RankedMatchSource()],
		new RewardsProjectionPostgresRepository(),
		new MissionCatalogPostgresRepository(),
		new CosmeticsUnitOfWork(),
		{ batchSize: config.rewardsWorker.batchSize, lagMs: config.rewardsWorker.lagMs },
	);
	return new RewardsWorker(tick, config.rewardsWorker.intervalMs, logger);
}
