import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { DoorProgress } from "./DoorProgress";

export interface DoorProgressRepository {
	listForUser(
		userId: string,
		calendarId: string,
		manager: QueryableManager,
	): Promise<DoorProgress[]>;
	/**
	 * Returns the door's row locked for the rest of the transaction, creating an untouched
	 * one first when the player has none. Every write to a door goes through this lock, which
	 * is what makes a read, a duel request, a roll and a recovery safe to race.
	 */
	lockDoor(
		userId: string,
		calendarId: string,
		day: number,
		manager: QueryableManager,
	): Promise<DoorProgress>;
	save(progress: DoorProgress, now: Date, manager: QueryableManager): Promise<void>;
}
