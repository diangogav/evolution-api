import { dataSource } from "../../../evolution-types/src/data-source";
import { DuelFacts } from "../domain/evaluateMatch";
import { MatchSource, SourceCursor, SourcedMatchFacts } from "../domain/MatchSource";

type MatchRow = {
	id: string;
	createdAt: Date;
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
const FETCH_QUERY = `SELECT m.id, m.created_at AS "createdAt", m.game_id AS "gameId", m.user_id AS "userId",
	m.winner, m.ban_list_name AS "banListName", m.date, m.opponent_ids AS "opponentIds",
	(SELECT json_agg(json_build_object('result', d.result, 'turns', d.turns) ORDER BY d.date ASC)
	   FROM duels d WHERE d.match_id = m.id AND d.user_id = m.user_id AND d.deleted_at IS NULL) AS duels
	FROM matches m
	WHERE m.anulled = false AND m.deleted_at IS NULL
	  AND ($1::timestamptz IS NULL OR (m.created_at, m.id) > ($1::timestamptz, $2::varchar))
	  AND m.created_at <= $3
	ORDER BY m.created_at ASC, m.id ASC
	LIMIT $4`;

export class RankedMatchSource implements MatchSource {
	readonly name = "matches";

	async fetchAfter(
		cursor: SourceCursor,
		limit: number,
		notAfter: Date,
	): Promise<SourcedMatchFacts[]> {
		const params = [cursor.lastCreatedAt, cursor.lastId ?? "", notAfter, limit];
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
function hasRegisteredOpponents(opponentIds: string | null): boolean {
	if (!opponentIds) return false;
	return opponentIds.split(",").every((id) => id.trim().length > 0);
}
