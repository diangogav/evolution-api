import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { ReservedDuelRecord } from "./ReservedDuelRecord";

export type MarkAppliedResult = "inserted" | "skipped";

// The reservations this module issued and the duel records it applied. Records are read
// from the duel server's table, only ever for reservations recorded here.
export interface EventDuelRepository {
	recordReservation(
		reservationId: string,
		runId: string,
		wave: number,
		botName: string,
		issuedAt: Date,
		manager: QueryableManager,
	): Promise<void>;
	runIdOf(reservationId: string, manager: QueryableManager): Promise<string | null>;
	findRecord(reservationId: string, manager: QueryableManager): Promise<ReservedDuelRecord | null>;
	/** The idempotency gate: a reservation's record is applied at most once. */
	markApplied(
		reservationId: string,
		runId: string,
		outcome: string,
		manager: QueryableManager,
	): Promise<MarkAppliedResult>;
	/**
	 * Issued reservations with a terminal record, or a record still open since before
	 * `staleBefore`, that were never applied. Oldest issue first.
	 */
	listPending(staleBefore: Date, limit: number, manager: QueryableManager): Promise<string[]>;
}
