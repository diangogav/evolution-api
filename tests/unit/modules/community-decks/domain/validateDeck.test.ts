import { describe, expect, it } from "bun:test";

import { validateDeck } from "../../../../../src/modules/community-decks/domain/validateDeck";
import { alternates, blacklist, edisonList, filler } from "./fixtures";

const lists = (main: number[], extra: number[] = [], side: number[] = []) => ({
	main,
	extra,
	side,
});

describe("validateDeck", () => {
	it("accepts a 40-card deck whose cards the list allows", () => {
		expect(validateDeck(lists(filler(40)), edisonList(), alternates)).toEqual({ legal: true });
	});

	it("rejects a card a whitelist does not list", () => {
		expect(validateDeck(lists([...filler(39), 29071332]), edisonList(), alternates)).toEqual({
			legal: false,
			reason: "card 29071332 is not allowed in 2010.3 Edison",
		});
	});

	it("rejects a card a blacklist forbids", () => {
		const result = validateDeck(lists(filler(40)), blacklist([[1000, 0]]), alternates);

		expect(result).toEqual({ legal: false, reason: "card 1000 is not allowed in 2026.9 TCG" });
	});

	it("allows a card a blacklist does not mention", () => {
		expect(validateDeck(lists(filler(40)), blacklist([]), alternates)).toEqual({ legal: true });
	});

	it("rejects more copies than the list's limit, counting main, extra and side together", () => {
		const list = edisonList([[910003009, 1]]);
		const deck = lists([...filler(39), 910003009], [], [910003009]);

		expect(validateDeck(deck, list, alternates)).toEqual({
			legal: false,
			reason: "card 910003009 exceeds its limit of 1",
		});
	});

	it("counts an alternate together with its original for copy limits", () => {
		const list = blacklist([[46986414, 2]]);
		const deck = lists([...filler(37), 46986414, 46986414, 36996508]);

		expect(validateDeck(deck, list, alternates)).toEqual({
			legal: false,
			reason: "card 46986414 exceeds its limit of 2",
		});
	});

	it("applies an original's blacklist limit to its unlisted alternate", () => {
		const result = validateDeck(
			lists([...filler(39), 36996508]),
			blacklist([[46986414, 0]]),
			alternates,
		);

		expect(result).toEqual({ legal: false, reason: "card 36996508 is not allowed in 2026.9 TCG" });
	});

	it("rejects a fourth copy even where the list does not mention the card", () => {
		const result = validateDeck(lists([...filler(36), 7, 7, 7, 7]), blacklist([]), alternates);

		expect(result).toEqual({ legal: false, reason: "card 7 exceeds its limit of 3" });
	});

	it("rejects a main deck under 40 or over 60 cards", () => {
		const list = blacklist([]);
		const big = [...filler(60), 1];

		expect(validateDeck(lists(filler(39)), list, alternates)).toEqual({
			legal: false,
			reason: "main deck has 39 cards (40-60)",
		});
		expect(validateDeck(lists(big), list, alternates)).toEqual({
			legal: false,
			reason: "main deck has 61 cards (40-60)",
		});
		expect(validateDeck(lists(filler(60)), list, alternates)).toEqual({ legal: true });
	});

	it("rejects an extra or side deck over 15 cards", () => {
		const list = blacklist([]);

		expect(validateDeck(lists(filler(40), filler(16, 5000)), list, alternates)).toEqual({
			legal: false,
			reason: "extra deck has 16 cards (max 15)",
		});
		expect(validateDeck(lists(filler(40), [], filler(16, 5000)), list, alternates)).toEqual({
			legal: false,
			reason: "side deck has 16 cards (max 15)",
		});
		expect(
			validateDeck(lists(filler(40), filler(15, 5000), filler(15, 6000)), list, alternates),
		).toEqual({ legal: true });
	});
});
