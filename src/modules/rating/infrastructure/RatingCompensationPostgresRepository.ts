import { dataSource } from "../../../evolution-types/src/data-source";
import {
	AppliedRatingHistoryRecord,
	RatingCompensationRepository,
} from "../domain/RatingCompensationRepository";

const INSERT_REVERSAL_QUERY = `
	INSERT INTO rating_history
	   (match_id, user_id, ban_list_name, season, kind, previous_rating, delta, k_factor, opponent_rating)
	 VALUES ($1, $2, $3, $4, 'reversal', $5, $6, $7, $8)
	 ON CONFLICT (match_id, user_id, kind) DO NOTHING
	 RETURNING id
`;

const HISTORY_FOR_PROJECTION_QUERY = `
	SELECT kind, delta
	FROM rating_history
	WHERE user_id = $1 AND ban_list_name = $2 AND season = $3
	ORDER BY created_at ASC, id ASC
`;

const UPSERT_RATING_QUERY = `
	INSERT INTO player_ratings (user_id, ban_list_name, season, rating, games_played, peak)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (user_id, ban_list_name, season)
	DO UPDATE SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, peak = EXCLUDED.peak, updated_at = now()
`;

type HistoryRow = { kind: "applied" | "reversal"; delta: number };

// Structural type covering only what reprojectRating needs from the
// transaction's EntityManager, avoiding a nominal mismatch between this
// package's typeorm install and evolution-types' separately installed one.
type QueryableManager = { query: (sql: string, parameters?: unknown[]) => Promise<unknown> };

export class RatingCompensationPostgresRepository implements RatingCompensationRepository {
	async findAppliedHistory(matchId: string): Promise<AppliedRatingHistoryRecord[]> {
		const rows: {
			matchId: string;
			userId: string;
			banListName: string;
			season: number;
			previousRating: number;
			delta: number;
			kFactor: number;
			opponentRating: number;
		}[] = await dataSource.query(
			`SELECT match_id AS "matchId", user_id AS "userId", ban_list_name AS "banListName",
			        season, previous_rating AS "previousRating", delta, k_factor AS "kFactor",
			        opponent_rating AS "opponentRating"
			 FROM rating_history
			 WHERE match_id = $1 AND kind = 'applied'`,
			[matchId],
		);

		return rows;
	}

	async insertReversal(entry: AppliedRatingHistoryRecord, reversalDelta: number): Promise<boolean> {
		return dataSource.transaction(async (manager) => {
			const inserted: { id: string }[] = await manager.query(INSERT_REVERSAL_QUERY, [
				entry.matchId,
				entry.userId,
				entry.banListName,
				entry.season,
				entry.previousRating,
				reversalDelta,
				entry.kFactor,
				entry.opponentRating,
			]);

			if (inserted.length === 0) {
				return false;
			}

			await this.reprojectRating(manager, entry.userId, entry.banListName, entry.season);

			return true;
		});
	}

	private async reprojectRating(
		manager: QueryableManager,
		userId: string,
		banListName: string,
		season: number,
	): Promise<void> {
		const rows = (await manager.query(HISTORY_FOR_PROJECTION_QUERY, [
			userId,
			banListName,
			season,
		])) as HistoryRow[];

		let rating = 1000;
		let peak = 1000;
		let appliedCount = 0;
		let reversalCount = 0;

		for (const row of rows) {
			rating += row.delta;
			peak = Math.max(peak, rating);

			if (row.kind === "applied") {
				appliedCount++;
			} else {
				reversalCount++;
			}
		}

		const gamesPlayed = Math.max(appliedCount - reversalCount, 0);

		await manager.query(UPSERT_RATING_QUERY, [
			userId,
			banListName,
			season,
			rating,
			gamesPlayed,
			peak,
		]);
	}
}
