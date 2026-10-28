import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventRun, EventRunStatus } from "../domain/EventRun";
import { EventRunRepository, ExpiredRun } from "../domain/EventRunRepository";
import { runQuery } from "./runQuery";

const COLUMNS = `id, user_id, event_id, deck_id, status, current_wave, waves_cleared,
	current_reservation_id, voids, created_at, updated_at, current_bot, faced_bots`;

// Transaction-scoped, keyed per (user, event): two run starts of one player serialize.
const LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended('event-run:' || $1 || ':' || $2, 0))`;

const FIND_BY_ID_QUERY = `SELECT ${COLUMNS} FROM event_runs WHERE id = $1 FOR UPDATE`;

const FIND_READY_QUERY = `SELECT ${COLUMNS} FROM event_runs
	WHERE user_id = $1 AND event_id = $2 AND status = 'ready' FOR UPDATE`;

const FIND_LATEST_QUERY = `SELECT ${COLUMNS} FROM event_runs
	WHERE user_id = $1 AND event_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`;

const INSERT_QUERY = `INSERT INTO event_runs (${COLUMNS})
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`;

const UPDATE_QUERY = `UPDATE event_runs SET status = $2, current_wave = $3, waves_cleared = $4,
	current_reservation_id = $5, voids = $6, updated_at = $7, current_bot = $8, faced_bots = $9::jsonb
	WHERE id = $1`;

const BEST_MARK_QUERY = `SELECT COALESCE(MAX(waves_cleared), 0)::int AS best
	FROM event_runs WHERE user_id = $1 AND event_id = $2`;

// A run whose current reservation already has a duel record is left alone: either the
// duel is live or its result is still to be applied, and applying comes first.
// The subquery locks each candidate row and reads its reservation before the UPDATE
// clears it, so the caller learns which reservation to revoke.
const EXPIRE_IDLE_QUERY = `UPDATE event_runs AS e
	SET status = 'expired', current_reservation_id = NULL, updated_at = $1
	FROM (
		SELECT r.id, r.current_reservation_id
		FROM event_runs AS r
		JOIN event_catalog AS c ON c.id = r.event_id
		WHERE r.status = 'ready'
			AND (r.updated_at < $2 OR c.ends_at <= $1)
			AND NOT EXISTS (
				SELECT 1 FROM reserved_duels AS d WHERE d.reservation_id = r.current_reservation_id
			)
		FOR UPDATE OF r
	) AS idle
	WHERE e.id = idle.id AND e.status = 'ready'
	RETURNING e.id, idle.current_reservation_id AS reservation_id`;

type Row = {
	id: string;
	user_id: string;
	event_id: string;
	deck_id: string;
	status: EventRunStatus;
	current_wave: number;
	waves_cleared: number;
	current_reservation_id: string | null;
	voids: number;
	created_at: Date;
	updated_at: Date;
	current_bot: string | null;
	faced_bots: string[];
};

function toRun(row: Row): EventRun {
	return {
		id: row.id,
		userId: row.user_id,
		eventId: row.event_id,
		deckId: row.deck_id,
		status: row.status,
		currentWave: Number(row.current_wave),
		wavesCleared: Number(row.waves_cleared),
		currentBot: row.current_bot,
		facedBots: row.faced_bots,
		currentReservationId: row.current_reservation_id,
		voids: Number(row.voids),
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

export class EventRunPostgresRepository implements EventRunRepository {
	async lockUserEvent(userId: string, eventId: string, manager: QueryableManager): Promise<void> {
		await manager.query(LOCK_QUERY, [userId, eventId]);
	}

	async findByIdForUpdate(runId: string, manager: QueryableManager): Promise<EventRun | null> {
		return this.one(FIND_BY_ID_QUERY, [runId], manager);
	}

	async findReadyForUpdate(
		userId: string,
		eventId: string,
		manager: QueryableManager,
	): Promise<EventRun | null> {
		return this.one(FIND_READY_QUERY, [userId, eventId], manager);
	}

	async findLatestForUpdate(
		userId: string,
		eventId: string,
		manager: QueryableManager,
	): Promise<EventRun | null> {
		return this.one(FIND_LATEST_QUERY, [userId, eventId], manager);
	}

	async insert(run: EventRun, manager: QueryableManager): Promise<void> {
		await runQuery(
			INSERT_QUERY,
			[
				run.id,
				run.userId,
				run.eventId,
				run.deckId,
				run.status,
				run.currentWave,
				run.wavesCleared,
				run.currentReservationId,
				run.voids,
				run.createdAt,
				run.updatedAt,
				run.currentBot,
				JSON.stringify(run.facedBots),
			],
			manager,
		);
	}

	async update(run: EventRun, manager: QueryableManager): Promise<void> {
		await runQuery(
			UPDATE_QUERY,
			[
				run.id,
				run.status,
				run.currentWave,
				run.wavesCleared,
				run.currentReservationId,
				run.voids,
				run.updatedAt,
				run.currentBot,
				JSON.stringify(run.facedBots),
			],
			manager,
		);
	}

	async bestMark(userId: string, eventId: string, manager?: QueryableManager): Promise<number> {
		const [row] = await runQuery<{ best: number | null }>(
			BEST_MARK_QUERY,
			[userId, eventId],
			manager,
		);
		return Number(row?.best ?? 0);
	}

	async expireIdle(now: Date, idleBefore: Date, manager: QueryableManager): Promise<ExpiredRun[]> {
		const result = await manager.query(EXPIRE_IDLE_QUERY, [now, idleBefore]);
		return returnedRows<{ id: string; reservation_id: string | null }>(result).map((row) => ({
			runId: row.id,
			reservationId: row.reservation_id,
		}));
	}

	private async one(
		sql: string,
		params: unknown[],
		manager: QueryableManager,
	): Promise<EventRun | null> {
		const [row] = await runQuery<Row>(sql, params, manager);
		return row ? toRun(row) : null;
	}
}

// TypeORM answers UPDATE ... RETURNING with [rows, affectedCount] on Postgres.
function returnedRows<T>(result: unknown): T[] {
	if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
	if (Array.isArray(result)) return result as T[];
	return [];
}
