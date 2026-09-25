import type { TierGame } from "./TierGame";

/** A rank that plays under a tier ladder: type banlist or group, never global. */
export type TierRank = { id: string; name: string };

export type TierGamesQuery = { userIds: string[]; rankIds: string[]; season: number };

export interface TiersRepository {
	/** The tiered ranks among the given names, in no particular order; unknown and global names are absent. */
	findEligibleRanks(rankNames: string[]): Promise<TierRank[]>;
	/** One netted row per active game of the given users in the given ranks, unordered. Empty sets read nothing. */
	findTierGames(query: TierGamesQuery): Promise<TierGame[]>;
}
