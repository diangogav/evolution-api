import { describe, expect, it } from "bun:test";

import { normalizeDeck } from "../../../../../src/modules/community-decks/domain/normalizeDeck";
import { PRE_ERRATA_PAIRS, alternates, blacklist, edisonList, filler } from "./fixtures";

describe("normalizeDeck", () => {
	for (const { card, original, alternate } of PRE_ERRATA_PAIRS) {
		it(`replaces ${card} ${original} with its Edison alternate ${alternate}`, () => {
			const deck = normalizeDeck(
				{ main: [...filler(39), original], extra: [], side: [original] },
				edisonList(),
				alternates,
			);

			expect(deck.main).toEqual([...filler(39), alternate]);
			expect(deck.side).toEqual([alternate]);
		});
	}

	it("keeps a card the list allows even when it has alternates", () => {
		const list = edisonList([[29071332, 1]]);

		const deck = normalizeDeck({ main: [29071332], extra: [], side: [] }, list, alternates);

		expect(deck.main).toEqual([29071332]);
	});

	it("keeps a disallowed card whose alternates the list does not allow either", () => {
		const limits = new Map(edisonList().limits);
		limits.delete(910003009);

		const deck = normalizeDeck(
			{ main: [29071332], extra: [], side: [] },
			{ label: "2010.3 Edison", whitelist: true, limits },
			alternates,
		);

		expect(deck.main).toEqual([29071332]);
	});

	it("never swaps a banned card for an alternate the blacklist merely does not mention", () => {
		const list = blacklist([[46986414, 0]]);

		const deck = normalizeDeck({ main: [46986414], extra: [], side: [] }, list, alternates);

		expect(deck.main).toEqual([46986414]);
	});

	it("swaps a banned card for an alternate the blacklist explicitly allows", () => {
		const list = blacklist([
			[46986414, 0],
			[36996508, 1],
		]);

		const deck = normalizeDeck({ main: [46986414], extra: [], side: [] }, list, alternates);

		expect(deck.main).toEqual([36996508]);
	});
});
