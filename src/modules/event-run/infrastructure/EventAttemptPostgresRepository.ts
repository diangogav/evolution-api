import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventAttemptRepository } from "../domain/EventAttemptRepository";
import { runQuery } from "./runQuery";

// One statement decides and counts: the conflicting row is locked by the upsert, so two
// concurrent starts cannot both read "2 of 3" and both spend the third attempt. No row
// returned means the cap was already reached.
const CONSUME_QUERY = `INSERT INTO event_run_attempts (user_id, event_id, period_key, count)
	VALUES ($1, $2, $3, 1)
	ON CONFLICT (user_id, event_id, period_key)
	DO UPDATE SET count = event_run_attempts.count + 1 WHERE event_run_attempts.count < $4
	RETURNING count`;

const USED_QUERY = `SELECT count FROM event_run_attempts
	WHERE user_id = $1 AND event_id = $2 AND period_key = $3`;

export class EventAttemptPostgresRepository implements EventAttemptRepository {
	async consume(
		userId: string,
		eventId: string,
		periodKey: string,
		max: number,
		manager: QueryableManager,
	): Promise<boolean> {
		const rows = await runQuery<{ count: number }>(
			CONSUME_QUERY,
			[userId, eventId, periodKey, max],
			manager,
		);
		return rows.length > 0;
	}

	async used(
		userId: string,
		eventId: string,
		periodKey: string,
		manager?: QueryableManager,
	): Promise<number> {
		const [row] = await runQuery<{ count: number }>(
			USED_QUERY,
			[userId, eventId, periodKey],
			manager,
		);
		return Number(row?.count ?? 0);
	}
}
