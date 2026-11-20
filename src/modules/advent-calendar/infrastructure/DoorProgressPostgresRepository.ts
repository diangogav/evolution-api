import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { DoorProgress } from "../domain/DoorProgress";
import { DoorProgressRepository } from "../domain/DoorProgressRepository";

const COLUMNS = `user_id, calendar_id, day, recovered_at, cleared_at, attempts, die_roll,
	current_reservation_id`;

const LIST_QUERY = `SELECT ${COLUMNS} FROM advent_doors
	WHERE user_id = $1 AND calendar_id = $2 ORDER BY day`;

// The row must exist before it can be locked; a concurrent first touch loses the insert
// and then waits on the same row lock.
const ENSURE_QUERY = `INSERT INTO advent_doors (user_id, calendar_id, day) VALUES ($1, $2, $3)
	ON CONFLICT (user_id, calendar_id, day) DO NOTHING`;

const LOCK_QUERY = `SELECT ${COLUMNS} FROM advent_doors
	WHERE user_id = $1 AND calendar_id = $2 AND day = $3 FOR UPDATE`;

const SAVE_QUERY = `UPDATE advent_doors SET recovered_at = $4, cleared_at = $5, attempts = $6,
	die_roll = $7, current_reservation_id = $8, updated_at = $9
	WHERE user_id = $1 AND calendar_id = $2 AND day = $3`;

type Row = {
	user_id: string;
	calendar_id: string;
	day: number | string;
	recovered_at: Date | string | null;
	cleared_at: Date | string | null;
	attempts: number | string;
	die_roll: number | string | null;
	current_reservation_id: string | null;
};

const toDate = (value: Date | string | null): Date | null => (value ? new Date(value) : null);

export class DoorProgressPostgresRepository implements DoorProgressRepository {
	async listForUser(
		userId: string,
		calendarId: string,
		manager: QueryableManager,
	): Promise<DoorProgress[]> {
		return (await runQuery<Row>(LIST_QUERY, [userId, calendarId], manager)).map(toProgress);
	}

	async lockDoor(
		userId: string,
		calendarId: string,
		day: number,
		manager: QueryableManager,
	): Promise<DoorProgress> {
		await runQuery(ENSURE_QUERY, [userId, calendarId, day], manager);
		const [row] = await runQuery<Row>(LOCK_QUERY, [userId, calendarId, day], manager);
		if (!row) throw new Error(`Advent door ${day} of "${calendarId}" could not be locked`);
		return toProgress(row);
	}

	async save(progress: DoorProgress, now: Date, manager: QueryableManager): Promise<void> {
		await runQuery(
			SAVE_QUERY,
			[
				progress.userId,
				progress.calendarId,
				progress.day,
				progress.recoveredAt,
				progress.clearedAt,
				progress.attempts,
				progress.dieRoll,
				progress.currentReservationId,
				now,
			],
			manager,
		);
	}
}

function toProgress(row: Row): DoorProgress {
	return {
		userId: row.user_id,
		calendarId: row.calendar_id,
		day: Number(row.day),
		recoveredAt: toDate(row.recovered_at),
		clearedAt: toDate(row.cleared_at),
		attempts: Number(row.attempts),
		dieRoll: row.die_roll === null ? null : Number(row.die_roll),
		currentReservationId: row.current_reservation_id,
	};
}
