import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import {
	generateReservationId,
	RequiredDeck,
	RESERVATION_TTL_SECONDS,
	ReservationStore,
	reservationPassword,
} from "../../reserved-duel";
import { TransactionRunner } from "../../rewards";
import { calendarDay, deckOf, doorOf, isCalendarOpen } from "../domain/AdventCalendar";
import { AdventCatalogRepository } from "../domain/AdventCatalogRepository";
import { AdventDuelRepository } from "../domain/AdventDuelRepository";
import { adventDuelReservation } from "../domain/AdventReservation";
import { doorStatus } from "../domain/DoorProgress";
import { DoorProgressRepository } from "../domain/DoorProgressRepository";
import { DoorView, toDoorView } from "./AdventCalendarView";
import { ApplyDoorDuel } from "./ApplyDoorDuel";

export type RequestDoorDuelInput = {
	userId: string;
	calendarId: string;
	day: number;
	deckId: string;
	now: Date;
};

export type DoorDuelTicket = {
	reservationId: string;
	password: string;
	day: number;
	botName: string;
	deck: RequiredDeck;
};

export type RequestDoorDuelResult = {
	door: DoorView;
	/** Null when the door needs no duel: its pending result cleared it. */
	duel: DoorDuelTicket | null;
};

/**
 * Issues the reservation for one door. Under the door's row lock the pending record of its
 * previous reservation is applied first, so a finished duel is never skipped: a loss is
 * counted and a win is never dropped. Only an open door gets a reservation; the previous
 * one is revoked first, or the request answers 409 when its duel is live.
 */
export class RequestDoorDuel {
	constructor(
		private readonly catalog: AdventCatalogRepository,
		private readonly doors: DoorProgressRepository,
		private readonly duels: AdventDuelRepository,
		private readonly reservations: ReservationStore,
		private readonly applyDuel: Pick<ApplyDoorDuel, "applyCurrent">,
		private readonly transactions: TransactionRunner,
		private readonly newReservationId: () => string = () => generateReservationId(),
	) {}

	async run(input: RequestDoorDuelInput): Promise<RequestDoorDuelResult> {
		return this.transactions.run(async (manager) => {
			const calendar = await this.catalog.findById(input.calendarId, manager);
			if (!calendar) throw new NotFoundError(`Calendar "${input.calendarId}" not found`);
			const door = doorOf(calendar, input.day);
			if (!door) throw new NotFoundError(`Door ${input.day} not found`);
			if (!isCalendarOpen(calendar, input.now)) throw new UnprocessableError("Calendar is closed");
			const deck = deckOf(calendar, input.deckId);
			if (!deck) throw new UnprocessableError(`Deck "${input.deckId}" is not in this calendar`);
			const today = calendarDay(calendar, input.now);
			if (door.day > today) throw new UnprocessableError("This door has not opened yet");

			const locked = await this.doors.lockDoor(input.userId, calendar.id, door.day, manager);
			const applied = await this.applyDuel.applyCurrent(locked, calendar, manager, input.now);
			let progress = applied.progress;

			const status = doorStatus(door.day, today, progress);
			if (status === "cleared") {
				return { door: toDoorView(calendar, door, today, progress), duel: null };
			}
			if (status !== "open") throw new UnprocessableError("Recover this door before playing it");

			if (progress.currentReservationId) {
				if (applied.duelLive) throw new ConflictError("A duel is in progress for this door");
				const revoked = await this.reservations.revoke(progress.currentReservationId);
				if (revoked === "in_use") throw new ConflictError("A duel is in progress for this door");
			}

			const reservationId = this.newReservationId();
			const reservation = adventDuelReservation({
				reservationId,
				format: calendar.format,
				userId: input.userId,
				deck,
				botName: door.botName,
			});
			await this.duels.recordReservation(
				{
					reservationId,
					userId: input.userId,
					calendarId: calendar.id,
					day: door.day,
					deckId: deck.id,
					issuedAt: input.now,
				},
				manager,
			);
			progress = { ...progress, currentReservationId: reservationId };
			await this.doors.save(progress, input.now, manager);
			// Published last, so a failed write above rolls back before the server can see it.
			await this.reservations.issue(reservation, RESERVATION_TTL_SECONDS);

			return {
				door: toDoorView(calendar, door, today, progress),
				duel: {
					reservationId,
					password: reservationPassword(reservationId),
					day: door.day,
					botName: door.botName,
					deck: { main: [...deck.main], extra: [...deck.extra], side: [] },
				},
			};
		});
	}
}
