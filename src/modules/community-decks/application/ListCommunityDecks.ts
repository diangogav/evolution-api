import type { CommunityDeckSourceName } from "../domain/CommunityDeck";
import type { CommunityDeckRepository } from "../domain/CommunityDeckRepository";

export const COMMUNITY_DECKS_MAX_PAGE_SIZE = 48;
export const COMMUNITY_DECKS_DEFAULT_PAGE_SIZE = 24;

export type ListCommunityDecksInput = {
	format?: string;
	q?: string;
	page: number;
	pageSize: number;
};

export type CommunityDeckItem = {
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
	updatedAt: string;
};

export type ListCommunityDecksResult = {
	items: CommunityDeckItem[];
	page: number;
	pageSize: number;
	total: number;
};

export class ListCommunityDecks {
	constructor(private readonly repository: Pick<CommunityDeckRepository, "search">) {}

	async run(input: ListCommunityDecksInput): Promise<ListCommunityDecksResult> {
		const q = input.q?.trim() || undefined;
		const format = input.format?.trim() || undefined;
		const { items, total } = await this.repository.search({ ...input, q, format });
		return {
			items: items.map((deck) => ({ ...deck, updatedAt: deck.updatedAt.toISOString() })),
			page: input.page,
			pageSize: input.pageSize,
			total,
		};
	}
}
