import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventRun } from "./EventRun";

/** A run the expiry just closed, with the reservation it dropped (null when none). */
export type ExpiredRun = { runId: string; reservationId: string | null };

export interface EventRunRepository {
	// Serializes run starts of one player in one event for the rest of the transaction.
	lockUserEvent(userId: string, eventId: string, manager: QueryableManager): Promise<void>;
	// The `*ForUpdate` reads lock the returned row until the transaction ends.
	findByIdForUpdate(runId: string, manager: QueryableManager): Promise<EventRun | null>;
	findReadyForUpdate(
		userId: string,
		eventId: string,
		manager: QueryableManager,
	): Promise<EventRun | null>;
	findLatestForUpdate(
		userId: string,
		eventId: string,
		manager: QueryableManager,
	): Promise<EventRun | null>;
	insert(run: EventRun, manager: QueryableManager): Promise<void>;
	update(run: EventRun, manager: QueryableManager): Promise<void>;
	/** Most waves the player ever cleared in this event, 0 without runs. */
	bestMark(userId: string, eventId: string, manager?: QueryableManager): Promise<number>;
	/**
	 * Expires ready runs idle since `idleBefore` or whose event closed at or before `now`,
	 * leaving alone any run whose current reservation already has a duel record (live or
	 * not yet applied). Returns the expired runs with the reservation each one dropped, so
	 * the caller can revoke it once the transaction commits.
	 */
	expireIdle(now: Date, idleBefore: Date, manager: QueryableManager): Promise<ExpiredRun[]>;
}
