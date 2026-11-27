import type { UserDeck } from "../../../../src/modules/user-decks/domain/UserDeck";

export const DECK_ID = "8f14e45f-ceea-467a-9575-3f1a2b6c7d8e";
export const T0 = new Date("2026-11-27T12:00:00Z");
export const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

export function deckMother(overrides: Partial<UserDeck> = {}): UserDeck {
	return {
		id: DECK_ID,
		name: "Blue-Eyes",
		format: "tcg",
		main: [89631139, 89631139, 89631139],
		extra: [],
		side: [],
		createdAt: T0,
		updatedAt: T0,
		...overrides,
	};
}

let counter = 0;
/** A different valid deck id on each call. */
export function newDeckId(): string {
	counter++;
	return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}
