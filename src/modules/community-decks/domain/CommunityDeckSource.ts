import type { SourceDeck } from "./SourceDeck";

export interface CommunityDeckSource {
	/** Every deck of the category, or a rejection: a partial category is never returned. */
	fetchCategory(category: string): Promise<SourceDeck[]>;
}
