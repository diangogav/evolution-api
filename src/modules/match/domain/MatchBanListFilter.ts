export type RankType = "banlist" | "group" | "global";

export type MatchBanListRank = {
	type: RankType;
	patterns: string[];
};

/**
 * How a requested ban list name has to be matched against the name stored on the
 * match rows.
 */
export type MatchBanListFilter =
	| { type: "all" }
	| { type: "name"; banListName: string }
	| { type: "patterns"; patterns: string[] };

export class MatchBanListFilters {
	/**
	 * A global ladder aggregates every ban list, so it filters nothing. A group
	 * ladder holds no matches of its own: it is the union of the ban list names its
	 * member patterns accept. Every other name, and any name without a rank, is the
	 * ban list itself.
	 */
	static resolve({
		banListName,
		rank,
	}: {
		banListName: string;
		rank: MatchBanListRank | null;
	}): MatchBanListFilter {
		if (rank?.type === "global") {
			return { type: "all" };
		}

		if (rank?.type === "group") {
			return { type: "patterns", patterns: rank.patterns };
		}

		return { type: "name", banListName };
	}
}
