import { createHash } from "node:crypto";

import type { DeckLists } from "./DeckLists";

// Two uploads of the same list in the same format are one deck: order inside a section
// does not matter, the section a card sits in does.
export function deckContentHash(format: string, deck: DeckLists): string {
	const sorted = (cards: number[]) => [...cards].sort((a, b) => a - b).join(",");
	return createHash("sha256")
		.update(`${format}|${sorted(deck.main)}|${sorted(deck.extra)}|${sorted(deck.side)}`)
		.digest("hex");
}
