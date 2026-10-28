import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { TransactionRunner } from "../../rewards/domain/TransactionRunner";
import {
	eventDuelReservation,
	generateReservationId,
	RequiredDeck,
	RESERVATION_TTL_SECONDS,
	reservationPassword,
} from "../domain/DuelReservation";
import { EventCatalogRepository } from "../domain/EventCatalogRepository";
import { findEventDeck } from "../domain/EventDefinition";
import { EventDuelRepository } from "../domain/EventDuelRepository";
import { isRunIdle } from "../domain/EventRun";
import { EventRunRepository } from "../domain/EventRunRepository";
import { ReservationStore } from "../domain/ReservationStore";
import { ApplyReservedDuel } from "./ApplyReservedDuel";
import { EventRunView, toEventRunView } from "./EventRunView";
import { releaseReservation } from "./releaseReservation";

export type RequestEventDuelInput = { userId: string; runId: string; now: Date };

export type EventDuelTicket = {
	reservationId: string;
	password: string;
	wave: number;
	botName: string;
	deck: RequiredDeck;
};

export type RequestEventDuelResult = {
	run: EventRunView;
	/** Null when the run is no longer ready (its pending result ended it) or it expired. */
	duel: EventDuelTicket | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Issues the reservation for the run's current wave. Under the run's row lock, the pending
 * record of the previous reservation is applied first: a finished duel is never skipped,
 * so a loss cannot be retried for free and a win is never dropped. Only a run still ready
 * gets a new reservation; the previous one is revoked first, or the request answers 409
 * when its duel is live.
 */
export class RequestEventDuel {
	constructor(
		private readonly catalog: EventCatalogRepository,
		private readonly runs: EventRunRepository,
		private readonly duels: EventDuelRepository,
		private readonly reservations: ReservationStore,
		private readonly applyDuel: Pick<ApplyReservedDuel, "applyCurrent">,
		private readonly transactions: TransactionRunner,
		private readonly newReservationId: () => string = () => generateReservationId(),
	) {}

	async run(input: RequestEventDuelInput): Promise<RequestEventDuelResult> {
		if (!UUID.test(input.runId)) throw new NotFoundError(`Run "${input.runId}" not found`);

		return this.transactions.run(async (manager) => {
			const locked = await this.runs.findByIdForUpdate(input.runId, manager);
			if (!locked || locked.userId !== input.userId) {
				throw new NotFoundError(`Run "${input.runId}" not found`);
			}
			const event = await this.catalog.findById(locked.eventId, manager);
			if (!event) throw new NotFoundError(`Event "${locked.eventId}" not found`);

			const applied = await this.applyDuel.applyCurrent(locked, event, manager, input.now);
			let run = applied.run;
			if (run.status !== "ready") return { run: toEventRunView(run, event), duel: null };

			if (!applied.duelLive && isRunIdle(run, event, input.now)) {
				await releaseReservation(run, false, this.reservations);
				run = { ...run, status: "expired", currentReservationId: null, updatedAt: input.now };
				await this.runs.update(run, manager);
				return { run: toEventRunView(run, event), duel: null };
			}

			await releaseReservation(run, applied.duelLive, this.reservations);

			// applyCurrent left the ready run with its wave's rival drawn and stored, so a retry
			// after a void meets the same bot.
			const deck = findEventDeck(event, run.deckId);
			const botName = run.currentBot;
			if (!deck || !botName) throw new Error(`Event "${event.id}" lost the run's deck or rival`);

			const reservationId = this.newReservationId();
			const reservation = eventDuelReservation({
				reservationId,
				format: event.format,
				userId: run.userId,
				deck,
				botName,
			});
			await this.duels.recordReservation(
				reservationId,
				run.id,
				run.currentWave,
				botName,
				input.now,
				manager,
			);
			run = { ...run, currentReservationId: reservationId, updatedAt: input.now };
			await this.runs.update(run, manager);
			// Published last, so a failed write above rolls back before the server can see it.
			await this.reservations.issue(reservation, RESERVATION_TTL_SECONDS);

			const participant = reservation.participants[0];
			const requiredDeck =
				participant.kind === "user" && participant.requiredDeck
					? participant.requiredDeck
					: { main: [], extra: [], side: [] };
			return {
				run: toEventRunView(run, event),
				duel: {
					reservationId,
					password: reservationPassword(reservationId),
					wave: run.currentWave,
					botName,
					deck: requiredDeck,
				},
			};
		});
	}
}
