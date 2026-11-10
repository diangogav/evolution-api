import { config } from "../../config";
import { ApplyLightningGame } from "../../modules/lightning/application/ApplyLightningGame";
import { CloseSwissRound } from "../../modules/lightning/application/CloseSwissRound";
import { CompleteLightningTournament } from "../../modules/lightning/application/CompleteLightningTournament";
import { PairLightningPlayers } from "../../modules/lightning/application/PairLightningPlayers";
import { PairSwissRound } from "../../modules/lightning/application/PairSwissRound";
import { ProcessLightningTick } from "../../modules/lightning/application/ProcessLightningTick";
import { LightningByePostgresRepository } from "../../modules/lightning/infrastructure/LightningByePostgresRepository";
import { LightningEntryPostgresRepository } from "../../modules/lightning/infrastructure/LightningEntryPostgresRepository";
import { LightningGamePostgresRepository } from "../../modules/lightning/infrastructure/LightningGamePostgresRepository";
import { LightningResultPostgresRepository } from "../../modules/lightning/infrastructure/LightningResultPostgresRepository";
import { LightningTournamentPostgresRepository } from "../../modules/lightning/infrastructure/LightningTournamentPostgresRepository";
import { LightningUnitOfWork } from "../../modules/lightning/infrastructure/LightningUnitOfWork";
import { LightningWorker } from "../../modules/lightning/infrastructure/LightningWorker";
import { BunRedisReservationStore } from "../../modules/reserved-duel/infrastructure/BunRedisReservationStore";
import { ReservedDuelPostgresReader } from "../../modules/reserved-duel/infrastructure/ReservedDuelPostgresReader";
import { EssenceLedgerPostgresRepository } from "../../modules/rewards/infrastructure/EssenceLedgerPostgresRepository";
import { Logger } from "../../shared/logger/domain/Logger";
import { redisClient } from "../../shared/redis/redisClient";

// Wires the lightning use cases to the adapters of the modules they depend on
// (reserved-duel, rewards). It lives in the composition root because it needs those
// modules' adapters. Shared by the router and the worker, so "/me" and the tick apply
// game records through the very same use case and stale threshold.
export function buildApplyLightningGame(logger: Logger): ApplyLightningGame {
	return new ApplyLightningGame(
		new LightningEntryPostgresRepository(),
		new LightningGamePostgresRepository(),
		new ReservedDuelPostgresReader(),
		new BunRedisReservationStore(redisClient),
		logger,
		config.lightningWorker.staleGameMinutes * 60_000,
	);
}

export function buildLightningWorker(logger: Logger): LightningWorker {
	const tournaments = new LightningTournamentPostgresRepository();
	const entries = new LightningEntryPostgresRepository();
	const games = new LightningGamePostgresRepository();
	const reservations = new BunRedisReservationStore(redisClient);
	const tick = new ProcessLightningTick(
		new LightningUnitOfWork(),
		tournaments,
		entries,
		games,
		buildApplyLightningGame(logger),
		new PairLightningPlayers(entries, games, reservations),
		new CloseSwissRound(tournaments, entries, games, reservations, logger),
		new PairSwissRound(
			tournaments,
			entries,
			games,
			new LightningByePostgresRepository(),
			reservations,
		),
		new CompleteLightningTournament(
			tournaments,
			entries,
			games,
			new LightningResultPostgresRepository(),
			new EssenceLedgerPostgresRepository(),
		),
		logger,
	);
	return new LightningWorker(tick, config.lightningWorker.intervalMs, logger);
}
