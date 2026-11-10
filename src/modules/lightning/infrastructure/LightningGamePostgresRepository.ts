import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import {
	LightningGame,
	LightningGameResolution,
	LightningGameStatus,
} from "../domain/LightningGame";
import { LightningGameRepository, ResolveGameResult } from "../domain/LightningGameRepository";
import { returnedRows, toDate } from "./returnedRows";

const COLUMNS = `reservation_id, tournament_id, seat0_user_id, seat1_user_id, issued_at, status,
	resolution, reason, applied_at`;

const INSERT_QUERY = `INSERT INTO lightning_games (${COLUMNS})
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

const LIST_PENDING_QUERY = `SELECT ${COLUMNS} FROM lightning_games
	WHERE tournament_id = $1 AND status = 'pending' ORDER BY issued_at, reservation_id`;

const PENDING_FOR_USER_QUERY = `SELECT ${COLUMNS} FROM lightning_games
	WHERE tournament_id = $1 AND status = 'pending' AND (seat0_user_id = $2 OR seat1_user_id = $2)
	ORDER BY issued_at DESC LIMIT 1`;

const LAST_RESOLVED_FOR_USER_QUERY = `SELECT ${COLUMNS} FROM lightning_games
	WHERE tournament_id = $1 AND status <> 'pending' AND (seat0_user_id = $2 OR seat1_user_id = $2)
	ORDER BY applied_at DESC NULLS LAST, issued_at DESC LIMIT 1`;

// The apply-once gate: only one transaction moves a game out of `pending`.
const RESOLVE_QUERY = `UPDATE lightning_games SET status = $2, resolution = $3, reason = $4,
	applied_at = $5 WHERE reservation_id = $1 AND status = 'pending' RETURNING reservation_id`;

const LIST_RESOLVED_QUERY = `SELECT ${COLUMNS} FROM lightning_games
	WHERE tournament_id = $1 AND status <> 'pending' ORDER BY applied_at, reservation_id`;

type Row = {
	reservation_id: string;
	tournament_id: string;
	seat0_user_id: string;
	seat1_user_id: string;
	issued_at: Date;
	status: LightningGameStatus;
	resolution: LightningGameResolution | null;
	reason: string | null;
	applied_at: Date | null;
};

function toGame(row: Row): LightningGame {
	return {
		reservationId: row.reservation_id,
		tournamentId: row.tournament_id,
		seat0UserId: row.seat0_user_id,
		seat1UserId: row.seat1_user_id,
		issuedAt: new Date(row.issued_at),
		status: row.status,
		resolution: row.resolution,
		reason: row.reason,
		appliedAt: toDate(row.applied_at),
	};
}

export class LightningGamePostgresRepository implements LightningGameRepository {
	async insert(game: LightningGame, manager: QueryableManager): Promise<void> {
		await runQuery(
			INSERT_QUERY,
			[
				game.reservationId,
				game.tournamentId,
				game.seat0UserId,
				game.seat1UserId,
				game.issuedAt,
				game.status,
				game.resolution,
				game.reason,
				game.appliedAt,
			],
			manager,
		);
	}

	async listPending(tournamentId: string, manager?: QueryableManager): Promise<LightningGame[]> {
		return (await runQuery<Row>(LIST_PENDING_QUERY, [tournamentId], manager)).map(toGame);
	}

	async findPendingForUser(
		tournamentId: string,
		userId: string,
		manager: QueryableManager,
	): Promise<LightningGame | null> {
		const [row] = await runQuery<Row>(PENDING_FOR_USER_QUERY, [tournamentId, userId], manager);
		return row ? toGame(row) : null;
	}

	async findLastResolvedForUser(
		tournamentId: string,
		userId: string,
		manager: QueryableManager,
	): Promise<LightningGame | null> {
		const [row] = await runQuery<Row>(
			LAST_RESOLVED_FOR_USER_QUERY,
			[tournamentId, userId],
			manager,
		);
		return row ? toGame(row) : null;
	}

	async resolve(
		reservationId: string,
		status: Exclude<LightningGameStatus, "pending">,
		resolution: LightningGameResolution,
		reason: string,
		appliedAt: Date,
		manager: QueryableManager,
	): Promise<ResolveGameResult> {
		const result = await manager.query(RESOLVE_QUERY, [
			reservationId,
			status,
			resolution,
			reason,
			appliedAt,
		]);
		return returnedRows(result).length > 0 ? "resolved" : "skipped";
	}

	async listResolved(tournamentId: string, manager?: QueryableManager): Promise<LightningGame[]> {
		return (await runQuery<Row>(LIST_RESOLVED_QUERY, [tournamentId], manager)).map(toGame);
	}
}
