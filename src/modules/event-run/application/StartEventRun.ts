import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { periodKey } from "../../rewards/domain/MissionPeriod";
import { TransactionRunner } from "../../rewards/domain/TransactionRunner";
import { EventAttemptRepository } from "../domain/EventAttemptRepository";
import { EventCatalogRepository } from "../domain/EventCatalogRepository";
import { findEventDeck, isEventOpen } from "../domain/EventDefinition";
import { startEventRun } from "../domain/EventRun";
import { EventRunRepository } from "../domain/EventRunRepository";
import { ReservationStore } from "../domain/ReservationStore";
import { assignRival, PickIndex, randomPickIndex } from "../domain/WaveRival";
import { ApplyReservedDuel } from "./ApplyReservedDuel";
import { EventRunView, toEventRunView } from "./EventRunView";
import { releaseReservation } from "./releaseReservation";

export type StartEventRunInput = { userId: string; eventId: string; deckId: string; now: Date };

/**
 * Starts a run at wave 1 and spends one of today's attempts. A ready run the player
 * already has is replaced (`superseded`), but only after its pending duel record is
 * applied: a run that just became won or lost is kept as it ended, and a live duel
 * refuses the new run (409) instead of being orphaned.
 */
export class StartEventRun {
	constructor(
		private readonly catalog: EventCatalogRepository,
		private readonly runs: EventRunRepository,
		private readonly attempts: EventAttemptRepository,
		private readonly reservations: ReservationStore,
		private readonly applyDuel: Pick<ApplyReservedDuel, "applyCurrent">,
		private readonly transactions: TransactionRunner,
		private readonly newId: () => string = () => crypto.randomUUID(),
		private readonly pick: PickIndex = randomPickIndex,
	) {}

	async run(input: StartEventRunInput): Promise<EventRunView> {
		const event = await this.catalog.findById(input.eventId);
		if (!event) throw new NotFoundError(`Event "${input.eventId}" not found`);
		if (!isEventOpen(event, input.now)) throw new UnprocessableError("Event is closed");
		if (!findEventDeck(event, input.deckId)) {
			throw new UnprocessableError(`Deck "${input.deckId}" is not part of this event`);
		}

		return this.transactions.run(async (manager) => {
			await this.runs.lockUserEvent(input.userId, event.id, manager);

			const consumed = await this.attempts.consume(
				input.userId,
				event.id,
				periodKey("daily", input.now),
				event.attemptsPerDay,
				manager,
			);
			if (!consumed) throw new UnprocessableError("No attempts left today");

			const existing = await this.runs.findReadyForUpdate(input.userId, event.id, manager);
			if (existing) {
				const { run, duelLive } = await this.applyDuel.applyCurrent(
					existing,
					event,
					manager,
					input.now,
				);
				if (run.status === "ready") {
					await releaseReservation(run, duelLive, this.reservations);
					await this.runs.update(
						{ ...run, status: "superseded", currentReservationId: null, updatedAt: input.now },
						manager,
					);
				}
			}

			const started = assignRival(
				startEventRun({
					id: this.newId(),
					userId: input.userId,
					eventId: event.id,
					deckId: input.deckId,
					now: input.now,
				}),
				event,
				this.pick,
			);
			await this.runs.insert(started, manager);
			return toEventRunView(started, event);
		});
	}
}
