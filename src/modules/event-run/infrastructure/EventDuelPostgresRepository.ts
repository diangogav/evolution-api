import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { ReservedDuelRecord, ReservedDuelRecordReader } from "../../reserved-duel";
import { EventDuelRepository, MarkAppliedResult } from "../domain/EventDuelRepository";

const RECORD_RESERVATION_QUERY = `INSERT INTO event_run_reservations
	(reservation_id, run_id, wave, bot_name, issued_at) VALUES ($1, $2, $3, $4, $5)`;

const RUN_ID_QUERY = `SELECT run_id FROM event_run_reservations WHERE reservation_id = $1`;

const MARK_APPLIED_QUERY = `INSERT INTO event_run_duels (reservation_id, run_id, outcome)
	VALUES ($1, $2, $3) ON CONFLICT (reservation_id) DO NOTHING RETURNING reservation_id`;

// Only reservations this module issued (the join starts from event_run_reservations), so
// rows other features write to reserved_duels are never read.
const LIST_PENDING_QUERY = `SELECT r.reservation_id FROM event_run_reservations AS r
	JOIN reserved_duels AS d ON d.reservation_id = r.reservation_id
	WHERE NOT EXISTS (SELECT 1 FROM event_run_duels AS a WHERE a.reservation_id = r.reservation_id)
		AND (d.ended_at IS NOT NULL OR COALESCE(d.joined_at, d.started_at) < $1)
	ORDER BY r.issued_at ASC LIMIT $2`;

export class EventDuelPostgresRepository implements EventDuelRepository {
	constructor(private readonly records: ReservedDuelRecordReader) {}

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
		const [record] = await this.records.findRecords([reservationId], manager);
		return record ?? null;
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
