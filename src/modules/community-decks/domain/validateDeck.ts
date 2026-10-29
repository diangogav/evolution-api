import { type CardAlternates, limitOf, originalsOf } from "./CardAlternates";
import type { DeckLists } from "./DeckLists";
import type { FormatList } from "./FormatList";

export const MAIN_DECK_MIN = 40;
export const MAIN_DECK_MAX = 60;
export const EXTRA_DECK_MAX = 15;
export const SIDE_DECK_MAX = 15;

export type DeckValidation = { legal: true } | { legal: false; reason: string };

// Validates a normalized deck. Copies are counted across main, extra and side, grouping
// each alternate with its original, and the group's limit is the strictest of its prints.
export function validateDeck(
	deck: DeckLists,
	list: FormatList,
	alternates: CardAlternates,
): DeckValidation {
	if (deck.main.length < MAIN_DECK_MIN || deck.main.length > MAIN_DECK_MAX) {
		return illegal(`main deck has ${deck.main.length} cards (${MAIN_DECK_MIN}-${MAIN_DECK_MAX})`);
	}
	if (deck.extra.length > EXTRA_DECK_MAX) {
		return illegal(`extra deck has ${deck.extra.length} cards (max ${EXTRA_DECK_MAX})`);
	}
	if (deck.side.length > SIDE_DECK_MAX) {
		return illegal(`side deck has ${deck.side.length} cards (max ${SIDE_DECK_MAX})`);
	}

	const originals = originalsOf(alternates);
	const groups = new Map<number, { copies: number; limit: number; card: number }>();
	for (const card of [...deck.main, ...deck.extra, ...deck.side]) {
		const limit = limitOf(card, list, originals);
		if (limit === 0) return illegal(`card ${card} is not allowed in ${list.label}`);
		const key = originals.get(card) ?? card;
		const group = groups.get(key) ?? { copies: 0, limit, card };
		group.copies += 1;
		group.limit = Math.min(group.limit, limit);
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		if (group.copies > group.limit) {
			return illegal(`card ${group.card} exceeds its limit of ${group.limit}`);
		}
	}
	return { legal: true };
}

const illegal = (reason: string): DeckValidation => ({ legal: false, reason });
