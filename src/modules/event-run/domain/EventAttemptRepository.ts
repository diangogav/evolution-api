import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

export interface EventAttemptRepository {
	/**
	 * Spends one attempt of the period if fewer than `max` were spent. Concurrent calls
	 * for the same (user, event, period) serialize on the row, so the cap holds.
	 */
	consume(
		userId: string,
		eventId: string,
		periodKey: string,
		max: number,
		manager: QueryableManager,
	): Promise<boolean>;
	used(
		userId: string,
		eventId: string,
		periodKey: string,
		manager?: QueryableManager,
	): Promise<number>;
}
