import { Logger } from "../../../shared/logger/domain/Logger";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { generateReservationId, ReservationStore } from "../../reserved-duel";
import { recordSwissGameOutcome } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningTournament } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { swissRoundEndsAt } from "../domain/swissRounds";
import { roundIsResolved, SwissTable, swissTables } from "../domain/swissTables";

export const ROUND_DEADLINE_REASON = "round_deadline";

export type CloseSwissRoundResult = {
	tournament: LightningTournament;
	/** Tables still unfinished when time was called, closed as draws. */
	deadlineDraws: number;
};

/**
 * The Swiss round barrier, under the tournament row lock, after the tick applied every
 * finished game. A reservation cannot cap a duel's length (the limit is per turn), so at the
 * round deadline every unfinished table is closed as a draw; a record arriving later is
 * ignored because the game already left `pending`. Once every table has a result the round
 * closes and its break starts. After the last round, or with one player left between rounds,
 * the tournament moves to `finishing` and the tick completes it.
 */
export class CloseSwissRound {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly reservations: ReservationStore,
		private readonly logger: Logger,
		private readonly newReservationId: () => string = () => generateReservationId(),
	) {}

	async close(
		tournament: LightningTournament,
		manager: QueryableManager,
		now: Date,
	): Promise<CloseSwissRoundResult> {
		if (tournament.system !== "swiss" || tournament.status !== "running") {
			return { tournament, deadlineDraws: 0 };
		}
		let current = tournament;
		let deadlineDraws = 0;

		if (current.currentRound > 0 && current.roundClosedAt === null) {
			const games = await this.games.listByRound(current.id, current.currentRound, manager);
			let tables = swissTables(games);
			const deadline = swissRoundEndsAt(current);
			if (deadline && now >= deadline) {
				for (const table of tables.filter((candidate) => candidate.state !== "resolved")) {
					if (await this.drawAtDeadline(current, table, manager, now)) deadlineDraws++;
				}
				tables = swissTables(
					await this.games.listByRound(current.id, current.currentRound, manager),
				);
			}
			if (!roundIsResolved(tables)) return { tournament: current, deadlineDraws };
			current = { ...current, roundClosedAt: now, updatedAt: now };
			await this.tournaments.update(current, manager);
		}

		const entries = await this.entries.listByTournament(current.id, manager);
		const active = entries.filter((entry) => entry.status === "active").length;
		const lastRoundClosed =
			current.currentRound > 0 && current.currentRound >= (current.rounds ?? 0);
		if (lastRoundClosed || active <= 1) {
			current = { ...current, status: "finishing", updatedAt: now };
			await this.tournaments.update(current, manager);
		}
		return { tournament: current, deadlineDraws };
	}

	private async drawAtDeadline(
		tournament: LightningTournament,
		table: SwissTable,
		manager: QueryableManager,
		now: Date,
	): Promise<boolean> {
		if (table.state === "live") {
			const marked = await this.games.resolve(
				table.latest.reservationId,
				"applied",
				"draw",
				ROUND_DEADLINE_REASON,
				now,
				manager,
			);
			if (marked === "skipped") return false;
			await this.revokeQuietly(table.latest.reservationId);
		} else {
			// Every reservation of the table was voided and none replaced it in time: the draw
			// still needs a game row, for the standings and the round's history.
			await this.games.insert(
				{
					reservationId: this.newReservationId(),
					tournamentId: tournament.id,
					seat0UserId: table.seat0UserId,
					seat1UserId: table.seat1UserId,
					issuedAt: now,
					status: "applied",
					resolution: "draw",
					reason: ROUND_DEADLINE_REASON,
					appliedAt: now,
					round: tournament.currentRound,
				},
				manager,
			);
		}
		for (const userId of [table.seat0UserId, table.seat1UserId]) {
			const entry = await this.entries.findOne(tournament.id, userId, manager);
			if (entry) await this.entries.update(recordSwissGameOutcome(entry, "draw", now), manager);
		}
		return true;
	}

	// A room still live keeps its key (`in_use`); its record is ignored when it arrives.
	private async revokeQuietly(reservationId: string): Promise<void> {
		try {
			await this.reservations.revoke(reservationId);
		} catch (error) {
			this.logger.error(
				`Lightning could not revoke reservation ${reservationId} at the round deadline: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
