import { dataSource } from "../../../evolution-types/src/data-source";
import { TierGame } from "../domain/TierGame";
import {
	MasterCandidatesQuery,
	MasterRating,
	MasterRatingsQuery,
	TierGamesQuery,
	TierRank,
	TiersRepository,
} from "../domain/TiersRepository";

const FIND_ELIGIBLE_RANKS_QUERY = `SELECT id, name FROM ranks
	WHERE name = ANY($1) AND type IN ('banlist', 'group')`;

// One netted row per active game: every ledger kind is summed, so an active
// game carries exactly its applied values, and the kind balance in HAVING is
// the same arithmetic projectRating uses for gamesPlayed. Every row looks up
// its duel time: the ledger's created_at only says when the row was written.
// No ORDER BY: the replay order is a domain rule (compareTierGames).
const FIND_TIER_GAMES_QUERY = `WITH games AS (
	SELECT pl.user_id, pl.rank_id, pl.game_id,
	       SUM(pl.points_delta)::int AS points_delta,
	       SUM(pl.wins_delta)::int   AS wins_delta,
	       (array_agg(pl.id) FILTER (WHERE pl.kind = 'applied'))[1] AS applied_id,
	       MIN(pl.created_at) FILTER (WHERE pl.kind = 'applied')    AS applied_at
	FROM points_ledger pl
	WHERE pl.user_id = ANY($1) AND pl.rank_id = ANY($2) AND pl.season = $3
	GROUP BY pl.user_id, pl.rank_id, pl.game_id
	HAVING COUNT(*) FILTER (WHERE pl.kind = 'applied')
	     - COUNT(*) FILTER (WHERE pl.kind = 'reversal')
	     + COUNT(*) FILTER (WHERE pl.kind = 'reinstatement') > 0
)
SELECT g.user_id AS "userId", g.rank_id AS "rankId", g.game_id AS "gameId",
       g.points_delta AS "pointsDelta", g.wins_delta > 0 AS "won",
       g.applied_id AS "appliedId",
       (EXTRACT(EPOCH FROM g.applied_at) * 1000)::float8 AS "appliedAt",
       (SELECT (EXTRACT(EPOCH FROM MIN(d.date)) * 1000)::float8 FROM duels d WHERE d.game_id = g.game_id) AS "duelAt",
       (SELECT MIN(o.user_id) FROM points_ledger o
         WHERE o.game_id = g.game_id AND o.rank_id = g.rank_id
           AND o.kind = 'applied' AND o.user_id <> g.user_id) AS "opponentId"
FROM games g`;

// The same total order the leaderboard uses (player_stats.points includes
// achievement points, exactly like the leaderboard), with user_id as the
// deterministic last key. The game minimum is a prefilter: eligibility is
// re-checked on the replay.
const FIND_MASTER_CANDIDATES_QUERY = `SELECT ps.user_id AS "userId",
       ps.wins::float / NULLIF(ps.wins + ps.losses, 0) AS win_rate
	FROM player_stats ps
	WHERE ps.rank_id = $1 AND ps.season = $2 AND ps.wins + ps.losses >= $3
	ORDER BY ps.points DESC, win_rate DESC, ps.user_id ASC
	LIMIT $4 OFFSET $5`;

const FIND_MASTER_RATINGS_QUERY = `SELECT pr.user_id AS "userId", pr.rating, pr.peak
	FROM player_ratings pr
	WHERE pr.rank_id = $1 AND pr.season = $2 AND pr.user_id = ANY($3)`;

export class TiersPostgresRepository implements TiersRepository {
	async findEligibleRanks(rankNames: string[]): Promise<TierRank[]> {
		if (rankNames.length === 0) return [];

		return dataSource.query(FIND_ELIGIBLE_RANKS_QUERY, [rankNames]);
	}

	async findTierGames({ userIds, rankIds, season }: TierGamesQuery): Promise<TierGame[]> {
		if (userIds.length === 0 || rankIds.length === 0) return [];

		return dataSource.query(FIND_TIER_GAMES_QUERY, [userIds, rankIds, season]);
	}

	async findMasterCandidates({
		rankId,
		season,
		minGames,
		limit,
		offset,
	}: MasterCandidatesQuery): Promise<string[]> {
		const rows: { userId: string }[] = await dataSource.query(FIND_MASTER_CANDIDATES_QUERY, [
			rankId,
			season,
			minGames,
			limit,
			offset,
		]);

		return rows.map((row) => row.userId);
	}

	async findMasterRatings({
		rankId,
		season,
		userIds,
	}: MasterRatingsQuery): Promise<MasterRating[]> {
		if (userIds.length === 0) return [];

		return dataSource.query(FIND_MASTER_RATINGS_QUERY, [rankId, season, userIds]);
	}
}
