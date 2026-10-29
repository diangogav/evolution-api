import type { CommunityDeckSource } from "../domain/CommunityDeckSource";
import type { SourceDeck } from "../domain/SourceDeck";
import { parseYgoProDeckPage } from "./parseYgoProDeckPage";

export const YGOPRODECK_DECKS_URL = "https://ygoprodeck.com/api/decks/getDecks.php";
const PAGE_SIZE = 20;
const MIN_REQUEST_INTERVAL_MS = 1_000;

export type YgoProDeckClientOptions = {
	getJson: (url: string) => Promise<unknown>;
	sleep: (ms: number) => Promise<void>;
	now: () => Date;
	maxPages: number;
};

// Pages through one category, starting requests at least a second apart (also across
// categories: one client serves the whole sync). Any failed page rejects the category, so
// the caller never mistakes a partial list for the whole one.
export class YgoProDeckClient implements CommunityDeckSource {
	private lastRequestAt: number | null = null;

	constructor(private readonly options: YgoProDeckClientOptions) {}

	async fetchCategory(category: string): Promise<SourceDeck[]> {
		const decks: SourceDeck[] = [];
		for (let page = 0; page < this.options.maxPages; page++) {
			const params = new URLSearchParams({
				format: category,
				limit: String(PAGE_SIZE),
				offset: String(page * PAGE_SIZE),
			});
			const body = await this.request(`${YGOPRODECK_DECKS_URL}?${params}`);
			const entries = Array.isArray(body) ? body.length : 0;
			decks.push(...parseYgoProDeckPage(body, this.options.now()));
			if (entries < PAGE_SIZE) break;
		}
		return decks;
	}

	private async request(url: string): Promise<unknown> {
		if (this.lastRequestAt !== null) {
			const wait = MIN_REQUEST_INTERVAL_MS - (this.options.now().getTime() - this.lastRequestAt);
			if (wait > 0) await this.options.sleep(wait);
		}
		this.lastRequestAt = this.options.now().getTime();
		return this.options.getJson(url);
	}
}
