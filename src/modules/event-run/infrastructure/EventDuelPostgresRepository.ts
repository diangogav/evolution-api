import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventDuelRepository, MarkAppliedResult } from "../domain/EventDuelRepository";
import { ReservedDuelOutcome, ReservedDuelRecord } from "../domain/ReservedDuelRecord";
import { runQuery } from "./runQuery";

const RECORD_RESERVATION_QUERY = `INSERT INTO event_run_reservations
	(reservation_id, run_id, wave, bot_name, issued_at) VALUES ($1, $2, $3, $4, $5)`;

const RUN_ID_QUERY = `SELECT run_id FROM event_run_reservations WHERE reservation_id = $1`;

// `reserved_duels` belongs to the duel server: read-only here, and only by reservation id.
const FIND_RECORD_QUERY = `SELECT reservation_id, joined_at, started_at, ended_at, outcome,
	winner_seat, abandoned_by_seat, reason FROM reserved_duels WHERE reservation_id = $1`;

const MARK_APPLIED_QUERY = `INSERT INTO event_run_duels (reservation_id, run_id, outcome)
	VALUES ($1, $2, $3) ON CONFLICT (reservation_id) DO NOTHING RETURNING reservation_id`;

// Only reservations this module issued (the join starts from event_run_reservations), so
// rows other features write to reserved_duels are never read.
const LIST_PENDING_QUERY = `SELECT r.reservation_id FROM event_run_reservations AS r
	JOIN reserved_duels AS d ON d.reservation_id = r.reservation_id
	WHERE NOT EXISTS (SELECT 1 FROM event_run_duels AS a WHERE a.reservation_id = r.reservation_id)
		AND (d.ended_at IS NOT NULL OR COALESCE(d.joined_at, d.started_at) < $1)
	ORDER BY r.issued_at ASC LIMIT $2`;

type RecordRow = {
	reservation_id: string;
	joined_at: Date | null;
	started_at: Date | null;
	ended_at: Date | null;
	outcome: ReservedDuelOutcome | null;
	winner_seat: number | null;
	abandoned_by_seat: number | null;
	reason: string | null;
};

const toDate = (value: Date | null): Date | null => (value ? new Date(value) : null);
const toSeat = (value: number | null): number | null => (value === null ? null : Number(value));

export class EventDuelPostgresRepository implements EventDuelRepository {
	async recordReservation(
		reservationId: string,
		runId: string,
		wave: number,
		botName: string,
		issuedAt: Date,
		manager: QueryableManager,
	): Promise<void> {
		await runQuery(
			RECORD_RESERVATION_QUERY,
			[reservationId, runId, wave, botName, issuedAt],
			manager,
		);
	}

	async runIdOf(reservationId: string, manager: QueryableManager): Promise<string | null> {
		const [row] = await runQuery<{ run_id: string }>(RUN_ID_QUERY, [reservationId], manager);
		return row?.run_id ?? null;
	}

	async findRecord(
		reservationId: string,
		manager: QueryableManager,
	): Promise<ReservedDuelRecord | null> {
		const [row] = await runQuery<RecordRow>(FIND_RECORD_QUERY, [reservationId], manager);
		if (!row) return null;
		return {
			reservationId: row.reservation_id,
			joinedAt: toDate(row.joined_at),
			startedAt: toDate(row.started_at),
			endedAt: toDate(row.ended_at),
			outcome: row.outcome,
			winnerSeat: toSeat(row.winner_seat),
			abandonedBySeat: toSeat(row.abandoned_by_seat),
			reason: row.reason,
		};
	}

	async markApplied(
		reservationId: string,
		runId: string,
		outcome: string,
		manager: QueryableManager,
	): Promise<MarkAppliedResult> {
		const rows = await runQuery(MARK_APPLIED_QUERY, [reservationId, runId, outcome], manager);
		return rows.length > 0 ? "inserted" : "skipped";
	}

	async listPending(
		staleBefore: Date,
		limit: number,
		manager: QueryableManager,
	): Promise<string[]> {
		const rows = await runQuery<{ reservation_id: string }>(
			LIST_PENDING_QUERY,
			[staleBefore, limit],
			manager,
		);
		return rows.map((row) => row.reservation_id);
	}
}
