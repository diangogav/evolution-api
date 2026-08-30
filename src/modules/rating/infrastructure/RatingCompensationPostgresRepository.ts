import { dataSource } from "../../../evolution-types/src/data-source";
import {
	AppliedRatingHistoryRecord,
	RatingCompensationRepository,
} from "../domain/RatingCompensationRepository";

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
		const inserted: { id: string }[] = await dataSource.query(
			`INSERT INTO rating_history
			   (match_id, user_id, ban_list_name, season, kind, previous_rating, delta, k_factor, opponent_rating)
			 VALUES ($1, $2, $3, $4, 'reversal', $5, $6, $7, $8)
			 ON CONFLICT (match_id, user_id, kind) DO NOTHING
			 RETURNING id`,
			[
				entry.matchId,
				entry.userId,
				entry.banListName,
				entry.season,
				entry.previousRating,
				reversalDelta,
				entry.kFactor,
				entry.opponentRating,
			],
		);

		if (inserted.length === 0) {
			return false;
		}

		await dataSource.query(
			`UPDATE player_ratings
			 SET rating = rating + $1,
			     games_played = GREATEST(games_played - 1, 0),
			     updated_at = NOW()
			 WHERE user_id = $2 AND ban_list_name = $3 AND season = $4`,
			[reversalDelta, entry.userId, entry.banListName, entry.season],
		);

		return true;
	}
}
