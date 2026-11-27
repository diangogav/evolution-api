import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { ReservedDuelOutcome, ReservedDuelRecord } from "../domain/ReservedDuelRecord";
import { ReservedDuelRecordReader } from "../domain/ReservedDuelRecordReader";

// `reserved_duels` belongs to the duel server: read-only here, and only by reservation id.
const FIND_RECORDS_QUERY = `SELECT d.reservation_id, d.room_id, d.joined_at, d.started_at, d.ended_at,
	d.outcome, d.winner_seat, d.abandoned_by_seat, d.reason,
	ARRAY(SELECT p.seat FROM reserved_duel_participants p
		WHERE p.reservation_id = d.reservation_id AND p.kind = 'user' AND p.joined_at IS NULL
		ORDER BY p.seat) AS absent_user_seats
	FROM reserved_duels d WHERE d.reservation_id = ANY($1)`;

type RecordRow = {
	reservation_id: string;
	room_id: number | string | null;
	joined_at: Date | null;
	started_at: Date | null;
	ended_at: Date | null;
	outcome: ReservedDuelOutcome | null;
	winner_seat: number | string | null;
	abandoned_by_seat: number | string | null;
	reason: string | null;
	absent_user_seats: Array<number | string> | null;
};

const toDate = (value: Date | null): Date | null => (value ? new Date(value) : null);
const toNumber = (value: number | string | null): number | null =>
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
			roomId: toNumber(row.room_id),
			joinedAt: toDate(row.joined_at),
			startedAt: toDate(row.started_at),
			endedAt: toDate(row.ended_at),
			outcome: row.outcome,
			winnerSeat: toNumber(row.winner_seat),
			abandonedBySeat: toNumber(row.abandoned_by_seat),
			reason: row.reason,
			absentUserSeats: (row.absent_user_seats ?? []).map(Number),
		}));
	}
}
