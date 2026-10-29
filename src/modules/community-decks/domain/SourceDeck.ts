import type { DeckLists } from "./DeckLists";

// A deck as a community source publishes it, before any format rule ran.
export type SourceDeck = DeckLists & {
	sourceId: string;
	name: string;
	author: string;
	url: string;
	cover: number | null;
	views: number;
	sourceUpdatedAt: Date | null;
};
