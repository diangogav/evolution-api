import { describe, expect, it } from "bun:test";

import { YgoProDeckClient } from "../../../../../src/modules/community-decks/infrastructure/YgoProDeckClient";

const deck = (deckNum: number) => ({
	username: "Duelist",
	deck_name: `Deck ${deckNum}`,
	main_deck: '["1","2"]',
	deck_views: 1,
	deckNum,
	cover_card: "1",
	pretty_url: `deck-${deckNum}`,
	submit_date: "1 day ago",
});

function harness(pages: unknown[][], options: { failAt?: number; maxPages?: number } = {}) {
	let clock = 0;
	const urls: string[] = [];
	const sleeps: number[] = [];
	const client = new YgoProDeckClient({
		getJson: async (url) => {
			urls.push(url);
			clock += 300;
			if (options.failAt === urls.length) throw new Error("HTTP 503");
			return pages[urls.length - 1] ?? [];
		},
		sleep: async (ms) => {
			sleeps.push(ms);
			clock += ms;
		},
		now: () => new Date(clock),
		maxPages: options.maxPages ?? 10,
	});
	return { client, urls, sleeps };
}

const fullPage = (from: number) => Array.from({ length: 20 }, (_, index) => deck(from + index));

describe("YgoProDeckClient", () => {
	it("pages 20 at a time until an empty page", async () => {
		const { client, urls } = harness([fullPage(1), fullPage(21), []]);

		const decks = await client.fetchCategory("Edison Format Decks");

		expect(decks).toHaveLength(40);
		expect(urls).toEqual([
			"https://ygoprodeck.com/api/decks/getDecks.php?format=Edison+Format+Decks&limit=20&offset=0",
			"https://ygoprodeck.com/api/decks/getDecks.php?format=Edison+Format+Decks&limit=20&offset=20",
			"https://ygoprodeck.com/api/decks/getDecks.php?format=Edison+Format+Decks&limit=20&offset=40",
		]);
	});

	it("stops after a short page and after the maximum of pages", async () => {
		const short = harness([fullPage(1), [deck(21)]]);
		expect(await short.client.fetchCategory("Tournament Meta Decks")).toHaveLength(21);
		expect(short.urls).toHaveLength(2);

		const capped = harness([fullPage(1), fullPage(21), fullPage(41)], { maxPages: 2 });
		expect(await capped.client.fetchCategory("Tournament Meta Decks")).toHaveLength(40);
		expect(capped.urls).toHaveLength(2);
	});

	it("waits so that requests start at least a second apart", async () => {
		const { client, sleeps } = harness([fullPage(1), fullPage(21), []]);

		await client.fetchCategory("Tournament Meta Decks");

		expect(sleeps).toEqual([700, 700]);
	});

	it("fails the whole category when any page fails", async () => {
		const { client } = harness([fullPage(1), fullPage(21)], { failAt: 2 });

		await expect(client.fetchCategory("Tournament Meta Decks")).rejects.toThrow("HTTP 503");
	});
});
