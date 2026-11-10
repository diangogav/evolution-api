// The format lists decks are validated against. The sync uses the lists its categories
// name; JTP has no community category and serves deck checks elsewhere (lightning entries).
export const FORMAT_LIST_IDS = ["tcg", "genesys", "edison", "jtp"] as const;

export type FormatListId = (typeof FORMAT_LIST_IDS)[number];

export type CommunityDeckCategory = {
	/** The category exactly as YGOPRODeck names it (its `format` query parameter). */
	category: string;
	list: FormatListId;
	/** Casual uploads need a minimum of views; tournament results pass as they are. */
	requiresViews: boolean;
};

export const COMMUNITY_DECK_CATEGORIES: readonly CommunityDeckCategory[] = [
	{ category: "Tournament Meta Decks", list: "tcg", requiresViews: false },
	{ category: "Tournament Meta Decks (Genesys)", list: "genesys", requiresViews: false },
	{ category: "Edison Format Decks", list: "edison", requiresViews: true },
];
