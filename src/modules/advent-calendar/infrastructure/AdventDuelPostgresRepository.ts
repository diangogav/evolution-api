import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { ReservedDuelRecord, ReservedDuelRecordReader } from "../../reserved-duel";
import {
	AdventDuelRepository,
	IssuedDoorReservation,
	MarkAppliedResult,
} from "../domain/AdventDuelRepository";

const RECORD_RESERVATION_QUERY = `INSERT INTO advent_reservations
	(reservation_id, user_id, calendar_id, day, deck_id, issued_at)
	VALUES ($1, $2, $3, $4, $5, $6)`;

const MARK_APPLIED_QUERY = `INSERT INTO advent_duels (reservation_id, outcome)
	VALUES ($1, $2) ON CONFLICT (reservation_id) DO NOTHING RETURNING reservation_id`;

export class AdventDuelPostgresRepository implements AdventDuelRepository {
	constructor(private readonly records: ReservedDuelRecordReader) {}

	async recordReservation(
		reservation: IssuedDoorReservation,
		manager: QueryableManager,
	): Promise<void> {
		await runQuery(
			RECORD_RESERVATION_QUERY,
			[
				reservation.reservationId,
				reservation.userId,
				reservation.calendarId,
				reservation.day,
				reservation.deckId,
				reservation.issuedAt,
			],
			manager,
		);
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
		outcome: string,
		manager: QueryableManager,
	): Promise<MarkAppliedResult> {
		const rows = await runQuery(MARK_APPLIED_QUERY, [reservationId, outcome], manager);
		return rows.length > 0 ? "inserted" : "skipped";
	}
}
