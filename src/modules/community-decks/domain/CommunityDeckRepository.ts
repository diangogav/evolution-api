import type { CommunityDeck, CommunityDeckSourceName } from "./CommunityDeck";

// What the public endpoints read: the stored deck without the sync bookkeeping.
export type CommunityDeckView = {
	id: string;
	name: string;
	author: string;
	format: string;
	source: CommunityDeckSourceName;
	sourceUrl: string;
	cover: number;
	main: number[];
	extra: number[];
	side: number[];
	views: number;
	updatedAt: Date;
};

export type CommunityDeckSearch = {
	format?: string;
	q?: string;
	page: number;
	pageSize: number;
};

export type CommunityDeckFormatCount = { format: string; count: number };

export interface CommunityDeckRepository {
	/**
	 * Makes the stored decks of one source category exactly `decks`: upserts them by
	 * (source, source id) and removes the category's other rows, atomically.
	 */
	replaceCategory(
		source: CommunityDeckSourceName,
		category: string,
		decks: CommunityDeck[],
		syncedAt: Date,
	): Promise<{ removed: number }>;
	lastSyncedAt(source: CommunityDeckSourceName): Promise<Date | null>;
	search(query: CommunityDeckSearch): Promise<{ items: CommunityDeckView[]; total: number }>;
	formats(): Promise<CommunityDeckFormatCount[]>;
}
