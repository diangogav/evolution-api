import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

export type LightningResult = {
	tournamentId: string;
	userId: string;
	position: number;
	score: number;
	wins: number;
	draws: number;
	losses: number;
	tiebreak: number;
	pointsAwarded: number;
	essenceAwarded: number;
};

export type LightningRanking = {
	userId: string;
	username: string;
	season: number;
	points: number;
	tournamentsWon: number;
	tournamentsPlayed: number;
};

export interface LightningResultRepository {
	insertResults(results: LightningResult[], manager: QueryableManager): Promise<void>;
	listResults(tournamentId: string, manager?: QueryableManager): Promise<LightningResult[]>;
	/** Adds one tournament's outcome to the player's season row, creating it when missing. */
	addToRanking(
		userId: string,
		season: number,
		points: number,
		won: boolean,
		manager: QueryableManager,
	): Promise<void>;
	/** The season ranking, most points first. */
	listRankings(
		season: number,
		limit: number,
		manager?: QueryableManager,
	): Promise<LightningRanking[]>;
}
