export type TierId = "rookie" | "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master";

export type TierKind = "placement" | "absolute" | "relative";

export type TierDefinition = {
	id: TierId;
	name: string;
	order: number;
	kind: TierKind;
	/** Asset name only; the binary is served elsewhere. */
	icon: string;
	/** Effective points that grant the tier; null for tiers that are not threshold based. */
	threshold: number | null;
	/** Rookie: below it you stay Rookie. Master: eligibility minimum. */
	minGames: number | null;
	/** Wins over this many distinct opponents, evaluated over all active games. */
	distinctOpponentWins: number | null;
	/** Master: the tier a player must have reached to be eligible. */
	requiresTier: TierId | null;
	/** Master: how many players hold it at once. */
	size: number | null;
};

export type TierLadder = { tiers: TierDefinition[]; dailyOpponentCap: number };

export type TierOverrides = Record<string, Partial<Record<TierId, Partial<TierDefinition>>>>;

export type TierCatalog = { defaults: TierLadder; overrides: TierOverrides };

/** Games per UTC day against the same opponent that still move effective points. */
export const DAILY_OPPONENT_CAP = 2;
/** Active games needed to leave Rookie. */
export const ROOKIE_MIN_GAMES = 5;
/** Active games needed to be a Master candidate. */
export const MASTER_MIN_GAMES = 20;
/** Players holding Master per rank and season. */
export const MASTER_SIZE = 5;
/** Distinct opponents a player must have beaten to be granted Platinum or Diamond. */
export const DISTINCT_OPPONENT_WINS = 5;

const UNGATED = { minGames: null, distinctOpponentWins: null, requiresTier: null, size: null };

export const TIER_CATALOG: TierCatalog = {
	defaults: {
		dailyOpponentCap: DAILY_OPPONENT_CAP,
		tiers: [
			{
				id: "rookie",
				name: "Rookie",
				order: 0,
				kind: "placement",
				icon: "tier-rookie",
				threshold: null,
				...UNGATED,
				minGames: ROOKIE_MIN_GAMES,
			},
			{
				id: "bronze",
				name: "Bronze",
				order: 1,
				kind: "absolute",
				icon: "tier-bronze",
				threshold: null,
				...UNGATED,
			},
			{
				id: "silver",
				name: "Silver",
				order: 2,
				kind: "absolute",
				icon: "tier-silver",
				threshold: 3,
				...UNGATED,
			},
			{
				id: "gold",
				name: "Gold",
				order: 3,
				kind: "absolute",
				icon: "tier-gold",
				threshold: 10,
				...UNGATED,
			},
			{
				id: "platinum",
				name: "Platinum",
				order: 4,
				kind: "absolute",
				icon: "tier-platinum",
				threshold: 25,
				...UNGATED,
				distinctOpponentWins: DISTINCT_OPPONENT_WINS,
			},
			{
				id: "diamond",
				name: "Diamond",
				order: 5,
				kind: "absolute",
				icon: "tier-diamond",
				threshold: 40,
				...UNGATED,
				distinctOpponentWins: DISTINCT_OPPONENT_WINS,
			},
			{
				id: "master",
				name: "Master",
				order: 6,
				kind: "relative",
				icon: "tier-master",
				threshold: null,
				...UNGATED,
				minGames: MASTER_MIN_GAMES,
				requiresTier: "platinum",
				size: MASTER_SIZE,
			},
		],
	},
	overrides: {},
};

/**
 * The ladder a rank plays under: the defaults with that rank's overrides
 * merged per tier. Unknown ranks and ranks without overrides share the
 * default ladder object itself.
 */
export function ladderFor(rankName?: string, catalog: TierCatalog = TIER_CATALOG): TierLadder {
	const overrides = rankName === undefined ? undefined : catalog.overrides[rankName];
	if (!overrides) return catalog.defaults;

	return {
		...catalog.defaults,
		tiers: catalog.defaults.tiers.map((tier) => ({ ...tier, ...overrides[tier.id] })),
	};
}
