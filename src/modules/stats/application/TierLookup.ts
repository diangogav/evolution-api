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
}
