import type { DeckLists } from "./DeckLists";

export const COMMUNITY_DECK_SOURCES = ["ygoprodeck"] as const;

export type CommunityDeckSourceName = (typeof COMMUNITY_DECK_SOURCES)[number];

// A legal deck ready to store: normalized lists and the label of the list it passed.
export type CommunityDeck = DeckLists & {
	source: CommunityDeckSourceName;
	sourceId: string;
	category: string;
	url: string;
	author: string;
	name: string;
	format: string;
	cover: number;
	views: number;
	contentHash: string;
	sourceUpdatedAt: Date | null;
};
