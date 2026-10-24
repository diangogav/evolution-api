import { dataSource } from "../../../evolution-types/src/data-source";
import { DuelFacts } from "../domain/evaluateMatch";
import { MatchSource, SourceCursor, SourcedMatchFacts } from "../domain/MatchSource";

type MatchRow = {
	id: string;
	createdAt: string;
	gameId: string;
	userId: string;
	winner: boolean;
	banListName: string;
	date: Date;
	opponentIds: string | null;
	duels: DuelFacts[] | null;
};

// matches holds one row per player per ranked match; duels one row per player per game.
// Both are written by the game server. Rows are drained in (created_at, id) order after
// the cursor and no later than the lag bound, so a match whose duels are still landing
// is read on a later tick.
//
// created_at and date are `timestamp without time zone` holding UTC wall-clock values.
// node-postgres would read them as host-local time and write Date parameters with the
// host offset, shifting every instant on a non-UTC host. Both sides are pinned instead:
// `date` is read through AT TIME ZONE 'UTC' (a real instant), `created_at` as text with
// its full microsecond precision (it is the cursor), and bounds are passed as UTC
// wall-clock strings cast to `timestamp`.
const CREATED_AT_TEXT = `to_char(m.created_at, 'YYYY-MM-DD HH24:MI:SS.US')`;

const FETCH_QUERY = `SELECT m.id, ${CREATED_AT_TEXT} AS "createdAt", m.game_id AS "gameId",
	m.user_id AS "userId", m.winner, m.ban_list_name AS "banListName",
	m.date AT TIME ZONE 'UTC' AS "date", m.opponent_ids AS "opponentIds",
	(SELECT json_agg(json_build_object('result', d.result, 'turns', d.turns) ORDER BY d.date ASC)
	   FROM duels d WHERE d.match_id = m.id AND d.user_id = m.user_id AND d.deleted_at IS NULL) AS duels
	FROM matches m
	WHERE m.anulled = false AND m.deleted_at IS NULL
	  AND ($1::timestamp IS NULL OR (m.created_at, m.id) > ($1::timestamp, $2::varchar))
	  AND m.created_at <= $3::timestamp
	ORDER BY m.created_at ASC, m.id ASC
	LIMIT $4`;

export class RankedMatchSource implements MatchSource {
	readonly name = "matches";

	async fetchAfter(
		cursor: SourceCursor,
		limit: number,
		notAfter: Date,
	): Promise<SourcedMatchFacts[]> {
		const params = [cursor.lastCreatedAt, cursor.lastId ?? "", toUtcTimestamp(notAfter), limit];
		const rows = (await dataSource.query(FETCH_QUERY, params)) as MatchRow[];
		return rows.map((row) => ({
			sourceId: row.id,
			createdAt: row.createdAt,
			gameId: row.gameId,
			userId: row.userId,
			won: row.winner,
			ranked: true,
			opponentRegistered: hasRegisteredOpponents(row.opponentIds),
			banListName: row.banListName,
			date: row.date,
			duels: row.duels ?? [],
		}));
	}
}

// opponent_ids is a simple-array column: comma-separated, empty when unknown. Every
// slot must carry an id for the opponent side to count as registered.
export function hasRegisteredOpponents(opponentIds: string | null): boolean {
	if (!opponentIds) return false;
	return opponentIds.split(",").every((id) => id.trim().length > 0);
}

// 2026-10-23T10:00:05.000Z -> "2026-10-23 10:00:05.000", independent of the host zone.
export function toUtcTimestamp(date: Date): string {
	return date.toISOString().replace("T", " ").replace("Z", "");
}
