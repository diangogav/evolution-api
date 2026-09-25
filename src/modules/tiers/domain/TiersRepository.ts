import type { TierGame } from "./TierGame";

/** A rank that plays under a tier ladder: type banlist or group, never global. */
export type TierRank = { id: string; name: string };

export type TierGamesQuery = { userIds: string[]; rankIds: string[]; season: number };

export type MasterCandidatesQuery = {
	rankId: string;
	season: number;
	minGames: number;
	limit: number;
	offset: number;
};

export type MasterRatingsQuery = { rankId: string; season: number; userIds: string[] };

/** The Elo a Master player exposes, from player_ratings. */
export type MasterRating = { userId: string; rating: number; peak: number };

export interface TiersRepository {
	/** The tiered ranks among the given names, in no particular order; unknown and global names are absent. */
	findEligibleRanks(rankNames: string[]): Promise<TierRank[]>;
	/** One netted row per active game of the given users in the given ranks, unordered. Empty sets read nothing. */
	findTierGames(query: TierGamesQuery): Promise<TierGame[]>;
	/**
	 * One page of the user ids with at least minGames recorded games in the
	 * rank and season, in the leaderboard total order (points, win rate, then
	 * user id) so that the first eligible ones are the Master seats.
	 */
	findMasterCandidates(query: MasterCandidatesQuery): Promise<string[]>;
	/** Rating and peak of the given users in the rank and season. An empty set reads nothing. */
	findMasterRatings(query: MasterRatingsQuery): Promise<MasterRating[]>;
}
