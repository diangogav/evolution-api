import { config } from "../../config";
import { Logger } from "../../shared/logger/domain/Logger";
import { redisClient } from "../../shared/redis/redisClient";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GrantCosmeticToUser } from "../../modules/entitlements";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../modules/user/infrastructure/UserDirectoryPostgresRepository";
import { EssenceLedgerPostgresRepository } from "../../modules/rewards/infrastructure/EssenceLedgerPostgresRepository";
import { ApplyReservedDuel } from "../../modules/event-run/application/ApplyReservedDuel";
import { ProcessEventRunTick } from "../../modules/event-run/application/ProcessEventRunTick";
import { BunRedisReservationStore } from "../../modules/event-run/infrastructure/BunRedisReservationStore";
import { EventCatalogPostgresRepository } from "../../modules/event-run/infrastructure/EventCatalogPostgresRepository";
import { EventDuelPostgresRepository } from "../../modules/event-run/infrastructure/EventDuelPostgresRepository";
import { EventRunPostgresRepository } from "../../modules/event-run/infrastructure/EventRunPostgresRepository";
import { EventRunUnitOfWork } from "../../modules/event-run/infrastructure/EventRunUnitOfWork";
import { EventRunWorker } from "../../modules/event-run/infrastructure/EventRunWorker";

// Wires the event run use cases to the adapters of the modules they depend on
// (rewards, entitlements, catalog, loadout). It lives in the composition root because
// it needs those modules' Postgres adapters. Shared by the router and the worker, so
// "/me" and the tick apply duel records through the very same use case.
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
