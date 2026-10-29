import { dataSource } from "../../../evolution-types/src/data-source";
import type { ActivityRange } from "../domain/ActivityRange";
import type {
	ActivityCounts,
	ActivityStatsRepository,
	BucketCount,
	RankedBanListCount,
	UnrankedBanListCount,
} from "../domain/ActivityReport";

// `created_at` columns are `timestamp without time zone` holding UTC, so bounds are
// converted to UTC wall time and bucket starts are rendered as UTC ISO strings: the
// pg driver would otherwise read naive timestamps in the process time zone.
// Parameters: $1 range start, $2 range end (ISO strings), $3 date_trunc unit.
const IN_RANGE = `created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
		AND created_at < ($2::timestamptz AT TIME ZONE 'UTC')`;
const BUCKET = `to_char(date_trunc($3::text, created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const NEW_USERS_SQL = `
	SELECT ${BUCKET} AS start, COUNT(*)::int AS count
	FROM users
	WHERE deleted_at IS NULL AND ${IN_RANGE}
	GROUP BY 1`;

// Ranked rows are one per player, so a game is counted once, in the bucket of its
// first row; otherwise rows written around midnight would count it twice. `client`
// is the row's own player, so a game is EvoDuel when any of its rows says so.
const RANKED_MATCHES_SQL = `
	SELECT ${BUCKET} AS start, ban_list_name,
		COUNT(*)::int AS matches,
		COUNT(*) FILTER (WHERE is_evoduel)::int AS evoduel_matches
	FROM (
		SELECT game_id, MIN(ban_list_name) AS ban_list_name, MIN(created_at) AS created_at,
			bool_or(client = 'evoduel') IS TRUE AS is_evoduel
		FROM matches
		WHERE anulled = false AND deleted_at IS NULL AND ${IN_RANGE}
		GROUP BY game_id
	) games
	GROUP BY 1, 2`;

// simple-array columns are comma-separated text. A bot game has a "DW " player on
// either side; an EvoDuel game has a player whose handshake client was "evoduel".
const UNRANKED_MATCHES_SQL = `
	SELECT start, ban_list_name,
		COUNT(*) FILTER (WHERE NOT is_bot)::int AS matches,
		COUNT(*) FILTER (WHERE NOT is_bot AND is_evoduel)::int AS evoduel_matches,
		COUNT(*) FILTER (WHERE is_bot)::int AS bot_matches
	FROM (
		SELECT ${BUCKET} AS start, ban_list_name,
			(COALESCE(player_names, '') || ',' || COALESCE(opponent_names, '')) ~ '(^|,)DW ' AS is_bot,
			(COALESCE(player_clients, '') || ',' || COALESCE(opponent_clients, '')) ~ '(^|,)evoduel(,|$)' AS is_evoduel
		FROM unranked_matches
		WHERE ${IN_RANGE}
	) unranked
	GROUP BY 1, 2`;

// Annulled ranked games still count as played; unranked id columns only hold
// registered players, so guests never appear here.
const ACTIVE_PLAYERS_SQL = `
	SELECT start, COUNT(DISTINCT user_id)::int AS count
	FROM (
		SELECT ${BUCKET} AS start, user_id
		FROM matches
		WHERE deleted_at IS NULL AND ${IN_RANGE}
		UNION ALL
		SELECT ${BUCKET} AS start, ids.user_id
		FROM unranked_matches
		CROSS JOIN LATERAL unnest(
			string_to_array(COALESCE(player_ids, '') || ',' || COALESCE(opponent_ids, ''), ',')
		) AS ids(user_id)
		WHERE ${IN_RANGE}
	) players
	WHERE user_id <> ''
	GROUP BY 1`;

interface CountRow {
	start: string;
	count: number;
}

interface RankedRow {
	start: string;
	ban_list_name: string;
	matches: number;
	evoduel_matches: number;
}

interface UnrankedRow extends RankedRow {
	bot_matches: number;
}

export class ActivityStatsPostgresRepository implements ActivityStatsRepository {
	async countActivity(range: ActivityRange): Promise<ActivityCounts> {
		const params = [range.from.toISOString(), range.to.toISOString(), range.period];
		const [newUsers, activePlayers, ranked, unranked] = await Promise.all([
			dataSource.query(NEW_USERS_SQL, params) as Promise<CountRow[]>,
			dataSource.query(ACTIVE_PLAYERS_SQL, params) as Promise<CountRow[]>,
			dataSource.query(RANKED_MATCHES_SQL, params) as Promise<RankedRow[]>,
			dataSource.query(UNRANKED_MATCHES_SQL, params) as Promise<UnrankedRow[]>,
		]);

		return {
			newUsers: newUsers.map(toBucketCount),
			activePlayers: activePlayers.map(toBucketCount),
			rankedMatches: ranked.map(
				(row): RankedBanListCount => ({
					start: new Date(row.start),
					banListName: row.ban_list_name,
					matches: row.matches,
					evoduelMatches: row.evoduel_matches,
				}),
			),
			unrankedMatches: unranked.map(
				(row): UnrankedBanListCount => ({
					start: new Date(row.start),
					banListName: row.ban_list_name,
					matches: row.matches,
					evoduelMatches: row.evoduel_matches,
					botMatches: row.bot_matches,
				}),
			),
		};
	}
}

function toBucketCount(row: CountRow): BucketCount {
	return { start: new Date(row.start), count: row.count };
}
