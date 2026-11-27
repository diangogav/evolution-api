import { describe, expect, it } from "bun:test";

import {
	InvalidUserDeckError,
	lastChangeOf,
	userDeck,
} from "../../../../../src/modules/user-decks/domain/UserDeck";
import { at, deckMother } from "../deckMother";

describe("userDeck", () => {
	it("accepts a deck at the storage bounds and trims its name", () => {
		const deck = userDeck(
			deckMother({
				name: `  ${"x".repeat(64)}  `,
				format: "f".repeat(32),
				main: Array(80).fill(1),
				extra: Array(30).fill(2),
				side: Array(30).fill(3),
			}),
		);

		expect(deck.name).toHaveLength(64);
		expect(deck.main).toHaveLength(80);
	});

	it("accepts a deck without a format", () => {
		expect(userDeck(deckMother({ format: null })).format).toBeNull();
	});

	it.each([
		["an id that is not a UUID", { id: "deck-1" }],
		["an empty name", { name: "   " }],
		["a name of 65 characters", { name: "x".repeat(65) }],
		["an empty format", { format: "" }],
		["a format of 33 characters", { format: "f".repeat(33) }],
		["81 main cards", { main: Array(81).fill(1) }],
		["31 extra cards", { extra: Array(31).fill(1) }],
		["31 side cards", { side: Array(31).fill(1) }],
		["a card code of zero", { main: [0] }],
		["a card code that is not an integer", { side: [1.5] }],
		["an invalid time", { updatedAt: new Date("nope") }],
	])("rejects %s", (_label, overrides) => {
		expect(() => userDeck(deckMother(overrides))).toThrow(InvalidUserDeckError);
	});
});

describe("lastChangeOf", () => {
	it("is the deletion when it came after the last edit, and the edit otherwise", () => {
		expect(lastChangeOf({ updatedAt: at(1), deletedAt: at(2) })).toEqual(at(2));
		expect(lastChangeOf({ updatedAt: at(3), deletedAt: at(2) })).toEqual(at(3));
		expect(lastChangeOf({ updatedAt: at(1), deletedAt: null })).toEqual(at(1));
	});
});
