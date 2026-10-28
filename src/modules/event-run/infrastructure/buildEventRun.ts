import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { redisClient } from "../../../shared/redis/redisClient";
import { CosmeticPostgresRepository } from "../../catalog/infrastructure/CosmeticPostgresRepository";
import { GrantCosmeticToUser } from "../../entitlements/application/GrantCosmeticToUser";
import { EntitlementPostgresRepository } from "../../entitlements/infrastructure/EntitlementPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../loadout/infrastructure/UserDirectoryPostgresRepository";
import { EssenceLedgerPostgresRepository } from "../../rewards/infrastructure/EssenceLedgerPostgresRepository";
import { ApplyReservedDuel } from "../application/ApplyReservedDuel";
import { ProcessEventRunTick } from "../application/ProcessEventRunTick";
import { BunRedisReservationStore } from "./BunRedisReservationStore";
import { EventCatalogPostgresRepository } from "./EventCatalogPostgresRepository";
import { EventDuelPostgresRepository } from "./EventDuelPostgresRepository";
import { EventRunPostgresRepository } from "./EventRunPostgresRepository";
import { EventRunUnitOfWork } from "./EventRunUnitOfWork";
import { EventRunWorker } from "./EventRunWorker";

// Composition shared by the router and the worker, so "/me" and the tick apply duel
// records through the very same use case.
export function buildApplyReservedDuel(): ApplyReservedDuel {
	return new ApplyReservedDuel(
		new EventCatalogPostgresRepository(),
		new EventRunPostgresRepository(),
		new EventDuelPostgresRepository(),
		new EssenceLedgerPostgresRepository(),
		new GrantCosmeticToUser(
			new CosmeticPostgresRepository(),
			new EntitlementPostgresRepository(),
			new UserDirectoryPostgresRepository(),
		),
	);
}

export function buildEventRunWorker(logger: Logger): EventRunWorker {
	const tick = new ProcessEventRunTick(
		new EventRunUnitOfWork(),
		new EventDuelPostgresRepository(),
		new EventRunPostgresRepository(),
		buildApplyReservedDuel(),
		new BunRedisReservationStore(redisClient),
		logger,
		config.eventRunWorker.batchSize,
	);
	return new EventRunWorker(tick, config.eventRunWorker.intervalMs, logger);
}
