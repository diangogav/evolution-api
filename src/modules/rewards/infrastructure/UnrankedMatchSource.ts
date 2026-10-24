import { dataSource } from "../../../evolution-types/src/data-source";
import { DuelFacts } from "../domain/evaluateMatch";
import { MatchSource, SourceCursor, SourcedMatchFacts } from "../domain/MatchSource";
import { hasRegisteredOpponents, toUtcTimestamp } from "./RankedMatchSource";

type UnrankedDuelRow = { winnerTeam: number; turns: number };

type UnrankedMatchRow = {
	id: string;
	createdAt: string;
	gameId: string;
	banListName: string;
	date: Date;
	playerIds: string | null;
	opponentIds: string | null;
	winnerTeam: number;
	duels: UnrankedDuelRow[] | null;
};

// unranked_matches holds ONE row per match (not per player): team 0 in player_ids,
// team 1 in opponent_ids, both simple-array text with guests left out. The row fans out
// into one fact per registered user, each seeing the result from their own side; a
// guest-only match yields no facts but still moves the cursor. Timestamps get the same
// UTC treatment as matches (see RankedMatchSource).
const FETCH_QUERY = `SELECT um.id, to_char(um.created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS "createdAt",
	um.game_id AS "gameId", um.ban_list_name AS "banListName",
	um.date AT TIME ZONE 'UTC' AS "date", um.player_ids AS "playerIds",
	um.opponent_ids AS "opponentIds", um.winner_team AS "winnerTeam",
	(SELECT json_agg(json_build_object('winnerTeam', d.winner_team, 'turns', d.turns) ORDER BY d.date ASC, d.id ASC)
	   FROM unranked_duels d WHERE d.match_id = um.id) AS duels
	FROM unranked_matches um
	WHERE ($1::timestamp IS NULL OR (um.created_at, um.id) > ($1::timestamp, $2::varchar))
	  AND um.created_at <= $3::timestamp
	ORDER BY um.created_at ASC, um.id ASC
	LIMIT $4`;

export class UnrankedMatchSource implements MatchSource {
	readonly name = "unranked_matches";

	async fetchAfter(
		cursor: SourceCursor,
		limit: number,
		notAfter: Date,
	): Promise<SourcedMatchFacts[]> {
		const params = [cursor.lastCreatedAt, cursor.lastId ?? "", toUtcTimestamp(notAfter), limit];
		const rows = (await dataSource.query(FETCH_QUERY, params)) as UnrankedMatchRow[];
		return rows.flatMap((row) => [
			...registeredIds(row.playerIds).map((userId) => factFor(row, userId, 0)),
			...registeredIds(row.opponentIds).map((userId) => factFor(row, userId, 1)),
		]);
	}
}

function factFor(row: UnrankedMatchRow, userId: string, team: 0 | 1): SourcedMatchFacts {
	const otherSide = team === 0 ? row.opponentIds : row.playerIds;
	return {
		sourceId: row.id,
		createdAt: row.createdAt,
		gameId: row.gameId,
		userId,
		won: row.winnerTeam === team,
		ranked: false,
		opponentRegistered: hasRegisteredOpponents(otherSide),
		banListName: row.banListName,
		date: row.date,
		duels: (row.duels ?? []).map(
			(duel): DuelFacts => ({
				result: duel.winnerTeam === team ? "winner" : "loser",
				turns: duel.turns,
			}),
		),
	};
}

function registeredIds(ids: string | null): string[] {
	if (!ids) return [];
	return ids
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}
