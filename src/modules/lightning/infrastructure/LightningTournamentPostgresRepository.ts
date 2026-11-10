import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import {
	LightningFormat,
	LightningSystem,
	LightningTournament,
	LightningTournamentStatus,
	PrizeTable,
} from "../domain/LightningTournament";
import {
	LightningTournamentRepository,
	TournamentListing,
	TournamentListQuery,
} from "../domain/LightningTournamentRepository";
import { returnedRows, toDate } from "./returnedRows";

const COLUMNS = `id, name, format, status, season, registration_opens_at, starts_at, ends_at,
	turn_time_seconds, lobby_timeout_seconds, min_players, max_players, points_by_position,
	essence_by_position, created_by, cancelled_reason, created_at, updated_at,
	system, rounds, current_round, round_minutes, round_break_seconds, round_started_at,
	round_closed_at`;

const INSERT_QUERY = `INSERT INTO lightning_tournaments (${COLUMNS})
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16, $17, $18,
		$19, $20, $21, $22, $23, $24, $25)`;

const FIND_QUERY = `SELECT ${COLUMNS} FROM lightning_tournaments WHERE id = $1`;
const FIND_FOR_UPDATE_QUERY = `${FIND_QUERY} FOR UPDATE`;

// A Swiss start fixes the round count and re-estimates the end; every round moves the rest.
const UPDATE_QUERY = `UPDATE lightning_tournaments SET status = $2, cancelled_reason = $3,
	updated_at = $4, ends_at = $5, rounds = $6, current_round = $7, round_started_at = $8,
	round_closed_at = $9 WHERE id = $1`;

const TRANSITION_QUERY = `UPDATE lightning_tournaments SET status = $3, updated_at = $4
	WHERE id = $1 AND status = $2 RETURNING id`;

const listQuery = (newestFirst: boolean) => `SELECT ${prefixed("t")},
	(SELECT COUNT(*)::int FROM lightning_entries AS e
		WHERE e.tournament_id = t.id AND e.status = 'active') AS entry_count
	FROM lightning_tournaments AS t
	WHERE t.status::text = ANY($1)
	ORDER BY t.starts_at ${newestFirst ? "DESC" : "ASC"}, t.id LIMIT $2`;

const OPEN_IDS_QUERY = `SELECT id FROM lightning_tournaments
	WHERE status NOT IN ('completed', 'cancelled') ORDER BY starts_at, id`;

type Row = {
	id: string;
	name: string;
	format: LightningFormat;
	status: LightningTournamentStatus;
	season: number | string;
	registration_opens_at: Date;
	starts_at: Date;
	ends_at: Date;
	turn_time_seconds: number | string;
	lobby_timeout_seconds: number | string;
	min_players: number | string;
	max_players: number | string;
	points_by_position: PrizeTable;
	essence_by_position: PrizeTable;
	created_by: string;
	cancelled_reason: string | null;
	created_at: Date;
	updated_at: Date;
	system: LightningSystem;
	rounds: number | string | null;
	current_round: number | string;
	round_minutes: number | string;
	round_break_seconds: number | string;
	round_started_at: Date | null;
	round_closed_at: Date | null;
};

function prefixed(alias: string): string {
	return COLUMNS.split(",")
		.map((column) => `${alias}.${column.trim()}`)
		.join(", ");
}

function toTournament(row: Row): LightningTournament {
	return {
		id: row.id,
		name: row.name,
		format: row.format,
		status: row.status,
		system: row.system,
		season: Number(row.season),
		registrationOpensAt: new Date(row.registration_opens_at),
		startsAt: new Date(row.starts_at),
		endsAt: new Date(row.ends_at),
		turnTimeSeconds: Number(row.turn_time_seconds),
		lobbyTimeoutSeconds: Number(row.lobby_timeout_seconds),
		minPlayers: Number(row.min_players),
		maxPlayers: Number(row.max_players),
		pointsByPosition: row.points_by_position,
		essenceByPosition: row.essence_by_position,
		createdBy: row.created_by,
		cancelledReason: row.cancelled_reason,
		rounds: row.rounds === null ? null : Number(row.rounds),
		currentRound: Number(row.current_round),
		roundMinutes: Number(row.round_minutes),
		roundBreakSeconds: Number(row.round_break_seconds),
		roundStartedAt: toDate(row.round_started_at),
		roundClosedAt: toDate(row.round_closed_at),
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

export class LightningTournamentPostgresRepository implements LightningTournamentRepository {
	async insert(tournament: LightningTournament, manager?: QueryableManager): Promise<void> {
		await runQuery(
			INSERT_QUERY,
			[
				tournament.id,
				tournament.name,
				tournament.format,
				tournament.status,
				tournament.season,
				tournament.registrationOpensAt,
				tournament.startsAt,
				tournament.endsAt,
				tournament.turnTimeSeconds,
				tournament.lobbyTimeoutSeconds,
				tournament.minPlayers,
				tournament.maxPlayers,
				JSON.stringify(tournament.pointsByPosition),
				JSON.stringify(tournament.essenceByPosition),
				tournament.createdBy,
				tournament.cancelledReason,
				tournament.createdAt,
				tournament.updatedAt,
				tournament.system,
				tournament.rounds,
				tournament.currentRound,
				tournament.roundMinutes,
				tournament.roundBreakSeconds,
				tournament.roundStartedAt,
				tournament.roundClosedAt,
			],
			manager,
		);
	}

	async findById(id: string, manager?: QueryableManager): Promise<LightningTournament | null> {
		const [row] = await runQuery<Row>(FIND_QUERY, [id], manager);
		return row ? toTournament(row) : null;
	}

	async findByIdForUpdate(
		id: string,
		manager: QueryableManager,
	): Promise<LightningTournament | null> {
		const [row] = await runQuery<Row>(FIND_FOR_UPDATE_QUERY, [id], manager);
		return row ? toTournament(row) : null;
	}

	async update(tournament: LightningTournament, manager?: QueryableManager): Promise<void> {
		await runQuery(
			UPDATE_QUERY,
			[
				tournament.id,
				tournament.status,
				tournament.cancelledReason,
				tournament.updatedAt,
				tournament.endsAt,
				tournament.rounds,
				tournament.currentRound,
				tournament.roundStartedAt,
				tournament.roundClosedAt,
			],
			manager,
		);
	}

	async transitionStatus(
		id: string,
		from: LightningTournamentStatus,
		to: LightningTournamentStatus,
		now: Date,
		manager: QueryableManager,
	): Promise<boolean> {
		const result = await manager.query(TRANSITION_QUERY, [id, from, to, now]);
		return returnedRows(result).length > 0;
	}

	async list(query: TournamentListQuery, manager?: QueryableManager): Promise<TournamentListing[]> {
		const rows = await runQuery<Row & { entry_count: number | string }>(
			listQuery(query.newestFirst),
			[query.statuses, query.limit],
			manager,
		);
		return rows.map((row) => ({
			tournament: toTournament(row),
			entryCount: Number(row.entry_count),
		}));
	}

	async listOpenIds(manager: QueryableManager): Promise<string[]> {
		const rows = await runQuery<{ id: string }>(OPEN_IDS_QUERY, [], manager);
		return rows.map((row) => row.id);
	}
}
