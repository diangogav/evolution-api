import { dataSource } from "../../../evolution-types/src/data-source";
import {
	AppliedRatingHistoryRecord,
	OpenReversalRecord,
	RatingCompensationRepository,
} from "../domain/RatingCompensationRepository";
import { effectiveDelta, projectRating } from "../domain/RatingProjection";

// Serializes the read-recompute-write projection sequence per (user, rank,
// season) for the lifetime of the transaction. pg_advisory_xact_lock works
// even when no player_ratings row exists yet, unlike SELECT ... FOR UPDATE,
// which closes the concurrent-reversal lost-update window that a row lock
// alone cannot cover.
const ADVISORY_LOCK_QUERY = `
	SELECT pg_advisory_xact_lock(hashtextextended($1 || '|' || $2 || '|' || $3, 0))
`;

// Target-less ON CONFLICT DO NOTHING: the 4-column rating_history index is
// gone (ContractRatingHistoryUniqueIndex migration) — only the 5-column
// (match, user, rank, kind, cycle) index resolves this now, which is what
// makes a distinct cycle per annul/un-annul round trip insert instead of
// silently no-opping against a prior cycle's row.
const INSERT_REVERSAL_QUERY = `
	INSERT INTO rating_history
	   (match_id, user_id, rank_id, season, kind, previous_rating, delta, k_factor, opponent_rating, cycle)
	 VALUES ($1, $2, $3, $4, 'reversal', $5, $6, $7, $8, $9)
	 ON CONFLICT DO NOTHING
	 RETURNING id
`;

const INSERT_REINSTATEMENT_QUERY = `
	INSERT INTO rating_history
	   (match_id, user_id, rank_id, season, kind, previous_rating, delta, k_factor, opponent_rating, cycle)
	 VALUES ($1, $2, $3, $4, 'reinstatement', $5, $6, $7, $8, $9)
	 ON CONFLICT DO NOTHING
	 RETURNING id
`;

// Latest reversal row per (user, rank) within this match that has no
// matching reinstatement at the same cycle yet — the rows still owed a
// reinstatement.
const FIND_OPEN_REVERSALS_QUERY = `
	SELECT DISTINCT ON (user_id, rank_id)
	       match_id AS "matchId", user_id AS "userId", rank_id AS "rankId", season,
	       previous_rating AS "previousRating", delta, k_factor AS "kFactor",
	       opponent_rating AS "opponentRating", cycle
	FROM rating_history r
	WHERE match_id = $1 AND kind = 'reversal'
	  AND NOT EXISTS (
	    SELECT 1 FROM rating_history ri
	    WHERE ri.match_id = r.match_id AND ri.user_id = r.user_id AND ri.rank_id = r.rank_id
	      AND ri.kind = 'reinstatement' AND ri.cycle = r.cycle
	  )
	ORDER BY user_id, rank_id, created_at DESC, id DESC
`;

// match_id is only needed in-process to scope the cycle derivation below to
// this specific match; it is not part of RatingHistoryEntry, which the pure
// projection function reduces over regardless of which match a row came from.
const HISTORY_FOR_PROJECTION_QUERY = `
	SELECT match_id AS "matchId", kind, delta
	FROM rating_history
	WHERE user_id = $1 AND rank_id = $2 AND season = $3
	ORDER BY created_at ASC, id ASC
`;

type HistoryRow = {
	matchId: string;
	kind: "applied" | "reversal" | "reinstatement";
	delta: number;
};

const UPSERT_RATING_QUERY = `
	INSERT INTO player_ratings (user_id, rank_id, season, rating, games_played, peak)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (user_id, rank_id, season)
	DO UPDATE SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, peak = EXCLUDED.peak, updated_at = now()
`;

// Structural type covering only what the projection needs from the
// transaction's EntityManager, avoiding a nominal mismatch between this
// package's typeorm install and evolution-types' separately installed one.
type QueryableManager = { query: (sql: string, parameters?: unknown[]) => Promise<unknown> };

export class RatingCompensationPostgresRepository implements RatingCompensationRepository {
	async findAppliedHistory(matchId: string): Promise<AppliedRatingHistoryRecord[]> {
		const rows: {
			matchId: string;
			userId: string;
			rankId: string;
			season: number;
			previousRating: number;
			delta: number;
			kFactor: number;
			opponentRating: number;
		}[] = await dataSource.query(
			`SELECT match_id AS "matchId", user_id AS "userId", rank_id AS "rankId",
			        season, previous_rating AS "previousRating", delta, k_factor AS "kFactor",
			        opponent_rating AS "opponentRating"
			 FROM rating_history
			 WHERE match_id = $1 AND kind = 'applied'`,
			[matchId],
		);

		return rows;
	}

	async findOpenReversals(matchId: string): Promise<OpenReversalRecord[]> {
		return dataSource.query(FIND_OPEN_REVERSALS_QUERY, [matchId]);
	}

	async insertReversal(
		entry: AppliedRatingHistoryRecord,
		requestedDelta: number,
	): Promise<boolean> {
		return dataSource.transaction(async (manager) => {
			await manager.query(ADVISORY_LOCK_QUERY, [entry.userId, entry.rankId, entry.season]);

			// Read inside the lock: the floor is applied against the rating the
			// player holds now, which matches after the applied row was written.
			const history = await this.readHistory(manager, entry.userId, entry.rankId, entry.season);
			const liveRating = projectRating(history).rating;
			const storedDelta = effectiveDelta(liveRating, requestedDelta);
			// Opposite-kind cycle derivation: a reversal counts this match's own
			// reinstatement rows, so a fresh annul is cycle 0 and each later one
			// (after an intervening un-annul wrote a reinstatement) increments.
			const cycle = this.countMatchRowsOfKind(history, entry.matchId, "reinstatement");

			// previous_rating is the rating this row starts from, so a reversal
			// records the live one rather than the applied row's: copying that
			// would describe a starting point the reversal never had.
			const inserted: { id: string }[] = await manager.query(INSERT_REVERSAL_QUERY, [
				entry.matchId,
				entry.userId,
				entry.rankId,
				entry.season,
				liveRating,
				storedDelta,
				entry.kFactor,
				entry.opponentRating,
				cycle,
			]);

			if (inserted.length === 0) {
				return false;
			}

			await this.reprojectRating(manager, entry, [
				...history,
				{ matchId: entry.matchId, kind: "reversal", delta: storedDelta },
			]);

			return true;
		});
	}

	async insertReinstatement(entry: OpenReversalRecord, requestedDelta: number): Promise<boolean> {
		return dataSource.transaction(async (manager) => {
			await manager.query(ADVISORY_LOCK_QUERY, [entry.userId, entry.rankId, entry.season]);

			const history = await this.readHistory(manager, entry.userId, entry.rankId, entry.season);
			const liveRating = projectRating(history).rating;
			const storedDelta = effectiveDelta(liveRating, requestedDelta);
			// Opposite-kind cycle derivation: a reinstatement shares its cycle
			// with the reversal it undoes, one less than this match's reversal
			// count (the reversal it targets has already been counted).
			const cycle = this.countMatchRowsOfKind(history, entry.matchId, "reversal") - 1;

			const inserted: { id: string }[] = await manager.query(INSERT_REINSTATEMENT_QUERY, [
				entry.matchId,
				entry.userId,
				entry.rankId,
				entry.season,
				liveRating,
				storedDelta,
				entry.kFactor,
				entry.opponentRating,
				cycle,
			]);

			if (inserted.length === 0) {
				return false;
			}

			await this.reprojectRating(manager, entry, [
				...history,
				{ matchId: entry.matchId, kind: "reinstatement", delta: storedDelta },
			]);

			return true;
		});
	}

	private countMatchRowsOfKind(
		history: HistoryRow[],
		matchId: string,
		kind: HistoryRow["kind"],
	): number {
		return history.filter((row) => row.matchId === matchId && row.kind === kind).length;
	}

	private async readHistory(
		manager: QueryableManager,
		userId: string,
		rankId: string,
		season: number,
	): Promise<HistoryRow[]> {
		return (await manager.query(HISTORY_FOR_PROJECTION_QUERY, [
			userId,
			rankId,
			season,
		])) as HistoryRow[];
	}

	private async reprojectRating(
		manager: QueryableManager,
		entry: AppliedRatingHistoryRecord,
		history: HistoryRow[],
	): Promise<void> {
		const projected = projectRating(history);

		await manager.query(UPSERT_RATING_QUERY, [
			entry.userId,
			entry.rankId,
			entry.season,
			projected.rating,
			projected.gamesPlayed,
			projected.peak,
		]);
	}
}
