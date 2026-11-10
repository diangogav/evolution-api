import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import {
	LightningDeck,
	LightningEntry,
	LightningEntryStatus,
	LightningPresence,
} from "../domain/LightningEntry";
import {
	ActiveLightningEntrySummary,
	LightningEntryRepository,
} from "../domain/LightningEntryRepository";
import {
	LightningSystem,
	LIVE_LIGHTNING_TOURNAMENT_STATUSES,
	LiveLightningTournamentStatus,
} from "../domain/LightningTournament";
import { GAME_COLUMNS, GameRow, toGame } from "./LightningGamePostgresRepository";
import { returnedRows, toDate } from "./returnedRows";

const COLUMNS = `tournament_id, user_id, registered_at, status, presence, deck, score, wins, draws,
	losses, games_played, no_shows, last_opponent_id, idle_since`;

const INSERT_QUERY = `INSERT INTO lightning_entries (${COLUMNS})
	VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)`;

const UPDATE_QUERY = `UPDATE lightning_entries SET status = $3, presence = $4, deck = $5::jsonb,
	score = $6, wins = $7, draws = $8, losses = $9, games_played = $10, no_shows = $11,
	last_opponent_id = $12, idle_since = $13
	WHERE tournament_id = $1 AND user_id = $2`;

const FIND_ONE_QUERY = `SELECT ${COLUMNS} FROM lightning_entries
	WHERE tournament_id = $1 AND user_id = $2`;

const LIST_QUERY = `SELECT ${COLUMNS} FROM lightning_entries
	WHERE tournament_id = $1 ORDER BY registered_at, user_id`;

// A player who paused during registration stays away: only the ones waiting start the clock.
const START_WAITING_QUERY = `UPDATE lightning_entries SET idle_since = $2
	WHERE tournament_id = $1 AND status = 'active' AND presence = 'idle'`;

// `user_bans` belongs to the shared schema: read-only here, same database.
const REMOVE_BANNED_QUERY = `UPDATE lightning_entries AS e SET status = 'removed'
	WHERE e.tournament_id = $1 AND e.status = 'active'
		AND EXISTS (
			SELECT 1 FROM user_bans AS b WHERE b.user_id = e.user_id
				AND (b.expires_at IS NULL OR b.expires_at > now())
		)
	RETURNING e.user_id`;

// Polled from every page, so it stays plain reads: the few live tournaments come from the
// status index and each one reaches the entry, the pending game and the bye by their keys.
// Entries have no index on user_id alone, which is why the tournaments drive the join.
const ACTIVE_FOR_USER_QUERY = `SELECT t.id, t.name, t.system, t.status, t.starts_at, e.presence,
	(SELECT to_jsonb(g) FROM (
		SELECT ${GAME_COLUMNS} FROM lightning_games
		WHERE tournament_id = t.id AND status = 'pending' AND (seat0_user_id = $1 OR seat1_user_id = $1)
		ORDER BY issued_at DESC LIMIT 1
	) AS g) AS pending_game,
	(t.system = 'swiss' AND EXISTS (
		SELECT 1 FROM lightning_byes AS b
		WHERE b.tournament_id = t.id AND b.user_id = $1 AND b.round = t.current_round
	)) AS has_bye
	FROM lightning_tournaments AS t
	JOIN lightning_entries AS e ON e.tournament_id = t.id AND e.user_id = $1
	WHERE t.status IN (${LIVE_LIGHTNING_TOURNAMENT_STATUSES.map((status) => `'${status}'`).join(", ")})
		AND e.status = 'active'
	ORDER BY t.starts_at, t.id`;

type ActiveRow = {
	id: string;
	name: string;
	system: LightningSystem;
	status: LiveLightningTournamentStatus;
	starts_at: Date;
	presence: LightningPresence;
	/** jsonb: timestamps arrive as ISO strings, which toGame parses. */
	pending_game: GameRow | null;
	has_bye: boolean;
};

type Row = {
	tournament_id: string;
	user_id: string;
	registered_at: Date;
	status: LightningEntryStatus;
	presence: LightningPresence;
	deck: LightningDeck;
	score: number | string;
	wins: number | string;
	draws: number | string;
	losses: number | string;
	games_played: number | string;
	no_shows: number | string;
	last_opponent_id: string | null;
	idle_since: Date | null;
};

function toEntry(row: Row): LightningEntry {
	return {
		tournamentId: row.tournament_id,
		userId: row.user_id,
		registeredAt: new Date(row.registered_at),
		status: row.status,
		presence: row.presence,
		deck: row.deck,
		score: Number(row.score),
		wins: Number(row.wins),
		draws: Number(row.draws),
		losses: Number(row.losses),
		gamesPlayed: Number(row.games_played),
		noShows: Number(row.no_shows),
		lastOpponentId: row.last_opponent_id,
		idleSince: toDate(row.idle_since),
	};
}

export class LightningEntryPostgresRepository implements LightningEntryRepository {
	async insert(entry: LightningEntry, manager: QueryableManager): Promise<void> {
		await runQuery(
			INSERT_QUERY,
			[
				entry.tournamentId,
				entry.userId,
				entry.registeredAt,
				entry.status,
				entry.presence,
				JSON.stringify(entry.deck),
				entry.score,
				entry.wins,
				entry.draws,
				entry.losses,
				entry.gamesPlayed,
				entry.noShows,
				entry.lastOpponentId,
				entry.idleSince,
			],
			manager,
		);
	}

	async update(entry: LightningEntry, manager: QueryableManager): Promise<void> {
		await runQuery(
			UPDATE_QUERY,
			[
				entry.tournamentId,
				entry.userId,
				entry.status,
				entry.presence,
				JSON.stringify(entry.deck),
				entry.score,
				entry.wins,
				entry.draws,
				entry.losses,
				entry.gamesPlayed,
				entry.noShows,
				entry.lastOpponentId,
				entry.idleSince,
			],
			manager,
		);
	}

	async findOne(
		tournamentId: string,
		userId: string,
		manager?: QueryableManager,
	): Promise<LightningEntry | null> {
		const [row] = await runQuery<Row>(FIND_ONE_QUERY, [tournamentId, userId], manager);
		return row ? toEntry(row) : null;
	}

	async listByTournament(
		tournamentId: string,
		manager?: QueryableManager,
	): Promise<LightningEntry[]> {
		const rows = await runQuery<Row>(LIST_QUERY, [tournamentId], manager);
		return rows.map(toEntry);
	}

	async startWaiting(tournamentId: string, now: Date, manager: QueryableManager): Promise<void> {
		await runQuery(START_WAITING_QUERY, [tournamentId, now], manager);
	}

	async removeBanned(tournamentId: string, manager: QueryableManager): Promise<string[]> {
		const result = await manager.query(REMOVE_BANNED_QUERY, [tournamentId]);
		return returnedRows<{ user_id: string }>(result).map((row) => row.user_id);
	}

	async listActiveForUser(
		userId: string,
		manager?: QueryableManager,
	): Promise<ActiveLightningEntrySummary[]> {
		const rows = await runQuery<ActiveRow>(ACTIVE_FOR_USER_QUERY, [userId], manager);
		return rows.map((row) => ({
			tournamentId: row.id,
			name: row.name,
			system: row.system,
			status: row.status,
			startsAt: new Date(row.starts_at),
			presence: row.presence,
			pendingGame: row.pending_game ? toGame(row.pending_game) : null,
			hasBye: row.has_bye === true,
		}));
	}
}
