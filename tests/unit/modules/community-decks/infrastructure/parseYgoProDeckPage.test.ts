import { describe, expect, it } from "bun:test";

import {
	parseRelativeDate,
	parseYgoProDeckPage,
} from "../../../../../src/modules/community-decks/infrastructure/parseYgoProDeckPage";

const NOW = new Date("2026-10-29T12:00:00.000Z");

// Shape of one getDecks.php entry, trimmed to the fields we read plus a few we ignore.
const entry = (overrides: Record<string, unknown> = {}) => ({
	username: "Duelist",
	deck_name: "Fairies (Edison)",
	main_deck: '["27288416","27288416","05645210"]',
	extra_deck: '["25958491"]',
	side_deck: '["59509952"]',
	edit_date: null,
	submit_date: "5 hours ago",
	deck_views: 22,
	deckNum: 741607,
	cover_card: "69514125",
	pretty_url: "fairies-edison-741607",
	format: "Edison Format Decks",
	deck_price: "55.66",
	...overrides,
});

describe("parseYgoProDeckPage", () => {
	it("maps an entry to a source deck", () => {
		expect(parseYgoProDeckPage([entry()], NOW)).toEqual([
			{
				sourceId: "741607",
				name: "Fairies (Edison)",
				author: "Duelist",
				url: "https://ygoprodeck.com/deck/fairies-edison-741607",
				cover: 69514125,
				main: [27288416, 27288416, 5645210],
				extra: [25958491],
				side: [59509952],
				views: 22,
				sourceUpdatedAt: new Date("2026-10-29T07:00:00.000Z"),
			},
		]);
	});

	it("reads missing extra and side decks as empty and prefers the edit date", () => {
		const [deck] = parseYgoProDeckPage(
			[{ ...entry({ edit_date: "2 days ago" }), extra_deck: undefined, side_deck: undefined }],
			NOW,
		);

		expect(deck.extra).toEqual([]);
		expect(deck.side).toEqual([]);
		expect(deck.sourceUpdatedAt).toEqual(new Date("2026-10-27T12:00:00.000Z"));
	});

	it("skips entries with unreadable lists or passcodes", () => {
		const decks = parseYgoProDeckPage(
			[entry({ main_deck: "not json" }), entry({ main_deck: '["abc"]' }), entry()],
			NOW,
		);

		expect(decks).toHaveLength(1);
	});

	it("throws on a body that is not a list of decks", () => {
		expect(() => parseYgoProDeckPage({ error: "bad format" }, NOW)).toThrow();
	});
});

describe("parseRelativeDate", () => {
	it("reads YGOPRODeck's relative and absolute dates", () => {
		expect(parseRelativeDate("an hour ago", NOW)).toEqual(new Date("2026-10-29T11:00:00.000Z"));
		expect(parseRelativeDate("3 weeks ago", NOW)).toEqual(new Date("2026-10-08T12:00:00.000Z"));
		expect(parseRelativeDate("1 year ago", NOW)).toEqual(new Date("2025-10-29T12:00:00.000Z"));
		expect(parseRelativeDate("2024-05-01", NOW)).toEqual(new Date("2024-05-01T00:00:00.000Z"));
		expect(parseRelativeDate("someday", NOW)).toBeNull();
		expect(parseRelativeDate(null, NOW)).toBeNull();
	});
});
