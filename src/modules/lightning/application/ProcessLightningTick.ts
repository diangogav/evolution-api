import { Logger } from "../../../shared/logger/domain/Logger";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningTickUnitOfWork } from "../domain/LightningTickUnitOfWork";
import { LightningTournament } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { nextStatusByClock } from "../domain/nextStatusByClock";
import { startSwissTournament } from "../domain/swissRounds";
import { ApplyLightningGame } from "./ApplyLightningGame";
import { CloseSwissRound } from "./CloseSwissRound";
import { CompleteLightningTournament } from "./CompleteLightningTournament";
import { PairLightningPlayers } from "./PairLightningPlayers";
import { PairSwissRound } from "./PairSwissRound";

export type ProcessLightningTickResult = {
	tournaments: number;
	transitions: number;
	applied: number;
	/** Rows the server never closed, voided past the stale threshold: an infrastructure alert. */
	stale: number;
	paired: number;
	completed: number;
	/** Entries of players banned since they entered. */
	removed: number;
	/** Tournaments (or pairing passes) that threw; rolled back, logged and retried next tick. */
	failed: number;
	/** True when another instance held the worker lock and this tick did nothing. */
	skipped: boolean;
};

type Counts = Omit<ProcessLightningTickResult, "tournaments" | "skipped">;

export const NOT_ENOUGH_PLAYERS = "Not enough players";

/**
 * One worker tick. Every open tournament is processed under its own savepoint and its row
 * lock: clock transitions, then the pending games (finished ones applied, unclaimed and
 * stale ones voided), then completion once nothing is live, then a pairing pass. Pairing has
 * a savepoint of its own, so Redis being down never rolls back the results just applied. A
 * Swiss tournament closes its round (deadline draws, barrier, last round) before pairing.
 */
export class ProcessLightningTick {
	constructor(
		private readonly unitOfWork: LightningTickUnitOfWork,
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly applyGame: Pick<ApplyLightningGame, "applyGame">,
		private readonly pairPlayers: Pick<PairLightningPlayers, "pair">,
		private readonly closeSwissRound: Pick<CloseSwissRound, "close">,
		private readonly pairSwissRound: Pick<PairSwissRound, "pair">,
		private readonly completeTournament: Pick<CompleteLightningTournament, "complete">,
		private readonly logger: Logger,
	) {}

	async run(now: Date): Promise<ProcessLightningTickResult> {
		const result = await this.unitOfWork.run(async (manager) => {
			const counts: Counts = {
				transitions: 0,
				applied: 0,
				stale: 0,
				paired: 0,
				completed: 0,
				removed: 0,
				failed: 0,
			};
			const ids = await this.tournaments.listOpenIds(manager);
			for (const id of ids) {
				try {
					const delta = await this.unitOfWork.savepoint(manager, () =>
						this.processTournament(id, manager, now),
					);
					for (const key of Object.keys(delta) as Array<keyof Counts>) counts[key] += delta[key];
				} catch (error) {
					counts.failed++;
					this.logger.error(
						`Lightning worker could not process tournament ${id}: ${errorMessage(error)}`,
					);
				}
			}
			return { ...counts, tournaments: ids.length };
		});
		if (!result) {
			return {
				tournaments: 0,
				transitions: 0,
				applied: 0,
				stale: 0,
				paired: 0,
				completed: 0,
				removed: 0,
				failed: 0,
				skipped: true,
			};
		}
		return { ...result, skipped: false };
	}

	private async processTournament(
		id: string,
		manager: QueryableManager,
		now: Date,
	): Promise<Counts> {
		const counts: Counts = {
			transitions: 0,
			applied: 0,
			stale: 0,
			paired: 0,
			completed: 0,
			removed: 0,
			failed: 0,
		};
		let tournament = await this.tournaments.findByIdForUpdate(id, manager);
		if (!tournament || tournament.status === "completed" || tournament.status === "cancelled") {
			return counts;
		}

		tournament = await this.advanceClock(tournament, manager, now, counts);
		if (tournament.status === "completed" || tournament.status === "cancelled") return counts;

		counts.removed = (await this.entries.removeBanned(tournament.id, manager)).length;
		for (const game of await this.games.listPending(tournament.id, manager)) {
			const outcome = await this.applyGame.applyGame(game, manager, now);
			if (outcome === "applied") counts.applied++;
			if (outcome === "stale") counts.stale++;
		}

		// Again after applying: the last live game of a finishing tournament just closed.
		tournament = await this.advanceClock(tournament, manager, now, counts);
		if (tournament.status !== "running") return counts;

		if (tournament.system === "swiss") {
			const closed = await this.closeSwissRound.close(tournament, manager, now);
			counts.applied += closed.deadlineDraws;
			tournament = closed.tournament;
			if (tournament.status === "finishing") {
				counts.transitions++;
				await this.advanceClock(tournament, manager, now, counts);
				return counts;
			}
		}

		const running = tournament;
		try {
			counts.paired = await this.unitOfWork.savepoint(manager, () =>
				running.system === "swiss"
					? this.pairSwissRound.pair(running, manager, now)
					: this.pairPlayers.pair(running, manager, now),
			);
		} catch (error) {
			counts.failed++;
			this.logger.error(`Lightning worker could not pair tournament ${id}: ${errorMessage(error)}`);
		}
		return counts;
	}

	private async advanceClock(
		tournament: LightningTournament,
		manager: QueryableManager,
		now: Date,
		counts: Counts,
	): Promise<LightningTournament> {
		const entries = await this.entries.listByTournament(tournament.id, manager);
		const pending = await this.games.listPending(tournament.id, manager);
		const active = entries.filter((entry) => entry.status === "active").length;
		const next = nextStatusByClock({
			status: tournament.status,
			system: tournament.system,
			registrationOpensAt: tournament.registrationOpensAt,
			startsAt: tournament.startsAt,
			endsAt: tournament.endsAt,
			minPlayers: tournament.minPlayers,
			activeEntries: active,
			liveGames: pending.length,
			now,
		});
		if (next === tournament.status) return tournament;
		counts.transitions++;

		if (next === "completed") {
			const finishing = { ...tournament, status: "finishing" as const, updatedAt: now };
			if (tournament.status !== "finishing") await this.tournaments.update(finishing, manager);
			const outcome = await this.completeTournament.complete(finishing, manager, now);
			if (outcome === "completed") counts.completed++;
			return { ...finishing, status: "completed" };
		}

		let moved: LightningTournament = {
			...tournament,
			status: next,
			cancelledReason: next === "cancelled" ? NOT_ENOUGH_PLAYERS : tournament.cancelledReason,
			updatedAt: now,
		};
		if (next === "running" && tournament.system === "swiss") {
			moved = startSwissTournament(moved, active);
		}
		await this.tournaments.update(moved, manager);
		if (next === "running") await this.entries.startWaiting(tournament.id, now, manager);
		return moved;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
