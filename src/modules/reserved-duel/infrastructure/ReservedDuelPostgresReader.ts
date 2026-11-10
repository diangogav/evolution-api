import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { ReservedDuelOutcome, ReservedDuelRecord } from "../domain/ReservedDuelRecord";
import { ReservedDuelRecordReader } from "../domain/ReservedDuelRecordReader";

// `reserved_duels` belongs to the duel server: read-only here, and only by reservation id.
const FIND_RECORDS_QUERY = `SELECT reservation_id, joined_at, started_at, ended_at, outcome,
	winner_seat, abandoned_by_seat, reason FROM reserved_duels WHERE reservation_id = ANY($1)`;

type RecordRow = {
	reservation_id: string;
	joined_at: Date | null;
	started_at: Date | null;
	ended_at: Date | null;
	outcome: ReservedDuelOutcome | null;
	winner_seat: number | string | null;
	abandoned_by_seat: number | string | null;
	reason: string | null;
};

const toDate = (value: Date | null): Date | null => (value ? new Date(value) : null);
const toSeat = (value: number | string | null): number | null =>
	value === null ? null : Number(value);

export class ReservedDuelPostgresReader implements ReservedDuelRecordReader {
	async findRecords(
		reservationIds: string[],
		manager?: QueryableManager,
	): Promise<ReservedDuelRecord[]> {
		if (reservationIds.length === 0) return [];
		const rows = await runQuery<RecordRow>(FIND_RECORDS_QUERY, [reservationIds], manager);
		return rows.map((row) => ({
			reservationId: row.reservation_id,
			joinedAt: toDate(row.joined_at),
			startedAt: toDate(row.started_at),
			endedAt: toDate(row.ended_at),
			outcome: row.outcome,
			winnerSeat: toSeat(row.winner_seat),
			abandonedBySeat: toSeat(row.abandoned_by_seat),
			reason: row.reason,
		}));
	}
}
