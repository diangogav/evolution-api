import type { CardAlternates } from "./CardAlternates";
import type { DeckLists } from "./DeckLists";
import type { FormatList } from "./FormatList";

// Community lists carry the real passcodes. When the format does not allow one (Edison's
// pre-errata cards live under ids of our own), it is swapped for an alternate the list
// explicitly allows. An alternate a blacklist merely does not mention never qualifies:
// that would let a banned card back in under another id.
export function normalizeDeck(
	deck: DeckLists,
	list: FormatList,
	alternates: CardAlternates,
): DeckLists {
	const replace = (card: number): number => {
		if (isAllowed(card, list)) return card;
		const allowed = alternates.get(card)?.find((id) => (list.limits.get(id) ?? 0) > 0);
		return allowed ?? card;
	};
	return {
		main: deck.main.map(replace),
		extra: deck.extra.map(replace),
		side: deck.side.map(replace),
	};
}

function isAllowed(card: number, list: FormatList): boolean {
	const limit = list.limits.get(card);
	return limit === undefined ? !list.whitelist : limit > 0;
}
