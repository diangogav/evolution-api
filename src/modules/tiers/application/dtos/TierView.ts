import type { TierId } from "../../domain/TierCatalog";

/** Structurally identical to TierProgressSchema. */
export type TierProgressView = {
	nextTierId: TierId;
	unit: "games" | "points";
	current: number;
	target: number;
	distinctOpponentWins: { current: number; required: number } | null;
};

/** The additive `tier` object on profile ratings and leaderboard rows; structurally identical to TierViewSchema. */
export type TierView = {
	id: TierId;
	name: string;
	effectivePoints: number;
	gamesPlayed: number;
	progress: TierProgressView | null;
	/** Master only. */
	rating?: number;
	/** Master only. */
	peak?: number;
};
