import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { UnlockedLightningAchievement } from "./lightningAchievements";

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
	/** What this tournament unlocked for the player, kept for the ceremony. */
	achievements: UnlockedLightningAchievement[];
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
	/** Tournaments the player won, other than the given one. */
	countWins(
		userId: string,
		excludingTournamentId: string,
		manager: QueryableManager,
	): Promise<number>;
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
