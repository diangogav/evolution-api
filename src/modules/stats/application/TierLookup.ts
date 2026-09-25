import type { TierView } from "../../tiers/application/dtos/TierView";

/**
 * What the stats read paths need from the tiers module. Satisfied
 * structurally by TierResolver; stats never imports tiers infrastructure.
 */
export interface TierLookup {
	/** A player's tier per tiered rank, keyed by rank name; untiered names are absent. */
	forPlayer(query: {
		userId: string;
		season: number;
		rankNames: string[];
	}): Promise<Map<string, TierView>>;
	/** The tier of each user on one leaderboard page of a rank, keyed by user id; empty for an untiered rank. */
	forLeaderboardPage(query: {
		rankName: string;
		season: number;
		userIds: string[];
	}): Promise<Map<string, TierView>>;
}
