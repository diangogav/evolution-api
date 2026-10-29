import { runQuery } from "../../event-run/infrastructure/runQuery";
import type { EventRawStats, EventStatsRepository } from "../domain/EventStatsReport";

// Event tables live on the cosmetics DataSource; `users` is in the same database, so
// usernames are joined in place. Timestamps are timestamptz, so days are taken in UTC
// explicitly rather than in the session time zone. Every query takes $1 = event id.
const STATUS_SQL = `
	SELECT status::text AS status, COUNT(*)::int AS runs
	FROM event_runs
	WHERE event_id = $1
	GROUP BY status`;

const PLAYERS_TOTAL_SQL = `
	SELECT COUNT(DISTINCT user_id)::int AS players
	FROM event_runs
	WHERE event_id = $1`;

const DAILY_SQL = `
	SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
		COUNT(*)::int AS runs,
		COUNT(DISTINCT user_id)::int AS players
	FROM event_runs
	WHERE event_id = $1
	GROUP BY 1`;

const WAVES_CLEARED_SQL = `
	SELECT waves_cleared, COUNT(*)::int AS runs
	FROM event_runs
	WHERE event_id = $1
	GROUP BY waves_cleared`;

const DECKS_SQL = `
	SELECT deck_id,
		COUNT(*)::int AS runs,
		COUNT(DISTINCT user_id)::int AS players,
		COUNT(*) FILTER (WHERE status = 'won')::int AS completed_runs,
		MAX(waves_cleared)::int AS best_waves_cleared,
		SUM(waves_cleared)::int AS total_waves_cleared
	FROM event_runs
	WHERE event_id = $1
	GROUP BY deck_id`;

const DUELS_SQL = `
	SELECT duels.outcome, COUNT(*)::int AS duels
	FROM event_run_duels duels
	JOIN event_runs runs ON runs.id = duels.run_id
	WHERE runs.event_id = $1
	GROUP BY duels.outcome`;

const PLAYERS_SQL = `
	SELECT runs.user_id, users.username,
		COUNT(*)::int AS runs,
		MAX(runs.waves_cleared)::int AS best_waves_cleared,
		array_agg(DISTINCT runs.deck_id ORDER BY runs.deck_id) AS deck_ids,
		bool_or(runs.status = 'ready') AS in_progress,
		MAX(runs.updated_at) AS last_activity_at
	FROM event_runs runs
	JOIN users ON users.id = runs.user_id
	WHERE runs.event_id = $1
	GROUP BY runs.user_id, users.username`;

interface DeckRow {
	deck_id: string;
	runs: number;
	players: number;
	completed_runs: number;
	best_waves_cleared: number;
	total_waves_cleared: number;
}

interface PlayerRow {
	user_id: string;
	username: string;
	runs: number;
	best_waves_cleared: number;
	deck_ids: string[];
	in_progress: boolean;
	last_activity_at: Date | string;
}

export class EventStatsPostgresRepository implements EventStatsRepository {
	async loadRawStats(eventId: string): Promise<EventRawStats> {
		const params = [eventId];
		const [statuses, [total], daily, wavesCleared, decks, duels, players] = await Promise.all([
			runQuery<{ status: string; runs: number }>(STATUS_SQL, params),
			runQuery<{ players: number }>(PLAYERS_TOTAL_SQL, params),
			runQuery<{ date: string; runs: number; players: number }>(DAILY_SQL, params),
			runQuery<{ waves_cleared: number; runs: number }>(WAVES_CLEARED_SQL, params),
			runQuery<DeckRow>(DECKS_SQL, params),
			runQuery<{ outcome: string; duels: number }>(DUELS_SQL, params),
			runQuery<PlayerRow>(PLAYERS_SQL, params),
		]);

		return {
			statusCounts: statuses.map((row) => ({ status: row.status, runs: row.runs })),
			totalPlayers: total?.players ?? 0,
			daily: daily.map((row) => ({ date: row.date, runs: row.runs, players: row.players })),
			wavesCleared: wavesCleared.map((row) => ({
				wavesCleared: Number(row.waves_cleared),
				runs: row.runs,
			})),
			decks: decks.map((row) => ({
				deckId: row.deck_id,
				runs: row.runs,
				players: row.players,
				completedRuns: row.completed_runs,
				bestWavesCleared: row.best_waves_cleared,
				totalWavesCleared: row.total_waves_cleared,
			})),
			duelOutcomes: duels.map((row) => ({ outcome: row.outcome, duels: row.duels })),
			players: players.map((row) => ({
				userId: row.user_id,
				username: row.username,
				runs: row.runs,
				bestWavesCleared: row.best_waves_cleared,
				deckIds: row.deck_ids,
				inProgress: row.in_progress,
				lastActivityAt: new Date(row.last_activity_at),
			})),
		};
	}
}
