import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { ReservedDuelRecord } from "../../reserved-duel";

export type IssuedDoorReservation = {
	reservationId: string;
	userId: string;
	calendarId: string;
	day: number;
	deckId: string;
	issuedAt: Date;
};

export type MarkAppliedResult = "inserted" | "skipped";

// The reservations this module issued and the duel records it applied. Records are read
// from the duel server's table, only ever for reservations recorded here.
export interface AdventDuelRepository {
	recordReservation(reservation: IssuedDoorReservation, manager: QueryableManager): Promise<void>;
	findRecord(reservationId: string, manager: QueryableManager): Promise<ReservedDuelRecord | null>;
	/** The idempotency gate: a reservation's record is applied at most once. */
	markApplied(
		reservationId: string,
		outcome: string,
		manager: QueryableManager,
	): Promise<MarkAppliedResult>;
}
