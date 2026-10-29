import { describe, expect, it } from "bun:test";

import { COMMUNITY_DECK_CATEGORIES } from "../../../../../src/modules/community-decks/domain/CommunityDeckCategory";
import { curateDeck } from "../../../../../src/modules/community-decks/domain/curateDeck";
import { deckContentHash } from "../../../../../src/modules/community-decks/domain/deckContentHash";
import { meetsQuality } from "../../../../../src/modules/community-decks/domain/meetsQuality";
import {
	PRE_ERRATA_PAIRS,
	alternates,
	blacklist,
	edisonList,
	filler,
	sourceDeck,
} from "./fixtures";

const category = (name: string) => {
	const found = COMMUNITY_DECK_CATEGORIES.find((entry) => entry.category === name);
	if (!found) throw new Error(`unknown category ${name}`);
	return found;
};

const TCG = category("Tournament Meta Decks");
const GENESYS = category("Tournament Meta Decks (Genesys)");
const EDISON = category("Edison Format Decks");

describe("COMMUNITY_DECK_CATEGORIES", () => {
	it("maps the three YGOPRODeck categories to our format lists", () => {
		expect(COMMUNITY_DECK_CATEGORIES.map(({ category, list }) => [category, list])).toEqual([
			["Tournament Meta Decks", "tcg"],
			["Tournament Meta Decks (Genesys)", "genesys"],
			["Edison Format Decks", "edison"],
		]);
	});
});

describe("meetsQuality", () => {
	it("passes tournament decks whatever their views", () => {
		expect(meetsQuality(TCG, 0, 100)).toBe(true);
		expect(meetsQuality(GENESYS, 0, 100)).toBe(true);
	});

	it("passes Edison decks only from the minimum of views", () => {
		expect(meetsQuality(EDISON, 99, 100)).toBe(false);
		expect(meetsQuality(EDISON, 100, 100)).toBe(true);
	});
});

describe("deckContentHash", () => {
	it("ignores card order inside each section", () => {
		expect(deckContentHash("F", { main: [3, 1, 2], extra: [5, 4], side: [] })).toBe(
			deckContentHash("F", { main: [1, 2, 3], extra: [4, 5], side: [] }),
		);
	});

	it("tells sections and formats apart", () => {
		const base = deckContentHash("F", { main: [1, 2], extra: [], side: [] });

		expect(deckContentHash("F", { main: [1], extra: [2], side: [] })).not.toBe(base);
		expect(deckContentHash("F", { main: [1], extra: [], side: [2] })).not.toBe(base);
		expect(deckContentHash("G", { main: [1, 2], extra: [], side: [] })).not.toBe(base);
	});
});

describe("curateDeck", () => {
	const rules = { alternates, edisonMinViews: 100 };

	it("stores a legal Edison deck with its pre-errata cards replaced and the list's label", () => {
		const originals = PRE_ERRATA_PAIRS.map(({ original }) => original);
		const deck = sourceDeck({ main: [...filler(35), ...originals] });

		const result = curateDeck(deck, EDISON, edisonList(), rules);

		if (!result.accepted) throw new Error(result.reason);
		expect(result.deck.format).toBe("2010.3 Edison");
		expect(result.deck.category).toBe("Edison Format Decks");
		expect(result.deck.main).toEqual([
			...filler(35),
			...PRE_ERRATA_PAIRS.map(({ alternate }) => alternate),
		]);
		expect(result.deck.contentHash).toBe(
			deckContentHash("2010.3 Edison", {
				main: result.deck.main,
				extra: [],
				side: [],
			}),
		);
		expect(result.deck.source).toBe("ygoprodeck");
		expect(result.deck.sourceId).toBe("741607");
	});

	it("rejects an illegal deck with the reason", () => {
		const result = curateDeck(
			sourceDeck({ main: [...filler(39), 99999] }),
			EDISON,
			edisonList(),
			rules,
		);

		expect(result).toEqual({
			accepted: false,
			reason: "card 99999 is not allowed in 2010.3 Edison",
		});
	});

	it("rejects an Edison deck under the minimum of views", () => {
		const result = curateDeck(sourceDeck({ views: 10 }), EDISON, edisonList(), rules);

		expect(result).toEqual({ accepted: false, reason: "10 views (minimum 100)" });
	});

	it("keeps a tournament deck with few views", () => {
		const result = curateDeck(sourceDeck({ views: 0 }), TCG, blacklist([]), rules);

		expect(result.accepted).toBe(true);
	});

	it("falls back to the first main card when the source has no cover", () => {
		const result = curateDeck(sourceDeck({ cover: null }), TCG, blacklist([]), rules);

		if (!result.accepted) throw new Error(result.reason);
		expect(result.deck.cover).toBe(1000);
	});
});
