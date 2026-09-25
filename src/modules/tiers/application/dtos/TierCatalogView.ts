import type { TierId, TierKind } from "../../domain/TierCatalog";

/** One public ladder entry; structurally identical to TierDefinitionSchema. */
export type TierDefinitionView = {
	id: TierId;
	name: string;
	order: number;
	kind: TierKind;
	icon: string;
	threshold: number | null;
	minGames: number | null;
	distinctOpponentWins: number | null;
	requiresTier: TierId | null;
	size: number | null;
};

/** The body of GET /ranked-tiers; structurally identical to RankedTierCatalogSchema. */
export type TierCatalogView = {
	/** The rank the ladder was resolved for, or null for the default ladder. */
	banListName: string | null;
	dailyOpponentCap: number;
	/** The calendar-day boundary the daily cap counts in. */
	dayBoundary: "UTC";
	tiers: TierDefinitionView[];
};
