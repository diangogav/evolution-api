import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import {
	LightningRanking,
	LightningResult,
	LightningResultRepository,
} from "../domain/LightningResultRepository";

const RESULT_COLUMNS = `tournament_id, user_id, position, score, wins, draws, losses, tiebreak,
	points_awarded, essence_awarded`;

const INSERT_RESULT_QUERY = `INSERT INTO lightning_results (${RESULT_COLUMNS})
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

const LIST_RESULTS_QUERY = `SELECT ${RESULT_COLUMNS} FROM lightning_results
	WHERE tournament_id = $1 ORDER BY position`;

const ADD_TO_RANKING_QUERY = `INSERT INTO lightning_rankings
	(user_id, season, points, tournaments_won, tournaments_played) VALUES ($1, $2, $3, $4, 1)
	ON CONFLICT (user_id, season) DO UPDATE SET
		points = lightning_rankings.points + EXCLUDED.points,
		tournaments_won = lightning_rankings.tournaments_won + EXCLUDED.tournaments_won,
		tournaments_played = lightning_rankings.tournaments_played + 1,
		updated_at = now()`;

// Usernames live in the shared `users` table, same database; banned (soft-deleted) users
// leave the public ranking like they leave the leaderboard.
const LIST_RANKINGS_QUERY = `SELECT r.user_id, u.username, r.season, r.points, r.tournaments_won,
	r.tournaments_played
	FROM lightning_rankings AS r JOIN users AS u ON u.id = r.user_id
	WHERE r.season = $1 AND u.deleted_at IS NULL
	ORDER BY r.points DESC, r.tournaments_won DESC, r.user_id LIMIT $2`;

type ResultRow = {
	tournament_id: string;
	user_id: string;
	position: number | string;
	score: number | string;
	wins: number | string;
	draws: number | string;
	losses: number | string;
	tiebreak: number | string;
	points_awarded: number | string;
	essence_awarded: number | string;
};

type RankingRow = {
	user_id: string;
	username: string;
	season: number | string;
	points: number | string;
	tournaments_won: number | string;
	tournaments_played: number | string;
};

export class LightningResultPostgresRepository implements LightningResultRepository {
	async insertResults(results: LightningResult[], manager: QueryableManager): Promise<void> {
		for (const result of results) {
			await runQuery(
				INSERT_RESULT_QUERY,
				[
					result.tournamentId,
					result.userId,
					result.position,
					result.score,
					result.wins,
					result.draws,
					result.losses,
					result.tiebreak,
					result.pointsAwarded,
					result.essenceAwarded,
				],
				manager,
			);
		}
	}

	async listResults(tournamentId: string, manager?: QueryableManager): Promise<LightningResult[]> {
		const rows = await runQuery<ResultRow>(LIST_RESULTS_QUERY, [tournamentId], manager);
		return rows.map((row) => ({
			tournamentId: row.tournament_id,
			userId: row.user_id,
			position: Number(row.position),
			score: Number(row.score),
			wins: Number(row.wins),
			draws: Number(row.draws),
			losses: Number(row.losses),
			tiebreak: Number(row.tiebreak),
			pointsAwarded: Number(row.points_awarded),
			essenceAwarded: Number(row.essence_awarded),
		}));
	}

	async addToRanking(
		userId: string,
		season: number,
		points: number,
		won: boolean,
		manager: QueryableManager,
	): Promise<void> {
		await runQuery(ADD_TO_RANKING_QUERY, [userId, season, points, won ? 1 : 0], manager);
	}

	async listRankings(
		season: number,
		limit: number,
		manager?: QueryableManager,
	): Promise<LightningRanking[]> {
		const rows = await runQuery<RankingRow>(LIST_RANKINGS_QUERY, [season, limit], manager);
		return rows.map((row) => ({
			userId: row.user_id,
			username: row.username,
			season: Number(row.season),
			points: Number(row.points),
			tournamentsWon: Number(row.tournaments_won),
			tournamentsPlayed: Number(row.tournaments_played),
		}));
	}
}
