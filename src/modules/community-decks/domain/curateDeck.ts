import type { CardAlternates } from "./CardAlternates";
import type { CommunityDeck } from "./CommunityDeck";
import type { CommunityDeckCategory } from "./CommunityDeckCategory";
import { deckContentHash } from "./deckContentHash";
import type { FormatList } from "./FormatList";
import { meetsQuality } from "./meetsQuality";
import { normalizeDeck } from "./normalizeDeck";
import type { SourceDeck } from "./SourceDeck";
import { validateDeck } from "./validateDeck";

export type CurationRules = {
	alternates: CardAlternates;
	edisonMinViews: number;
};

export type CurationResult =
	| { accepted: true; deck: CommunityDeck }
	| { accepted: false; reason: string };

export function curateDeck(
	deck: SourceDeck,
	category: CommunityDeckCategory,
	list: FormatList,
	rules: CurationRules,
): CurationResult {
	if (!meetsQuality(category, deck.views, rules.edisonMinViews)) {
		return { accepted: false, reason: `${deck.views} views (minimum ${rules.edisonMinViews})` };
	}
	const lists = normalizeDeck(deck, list, rules.alternates);
	const validation = validateDeck(lists, list, rules.alternates);
	if (!validation.legal) return { accepted: false, reason: validation.reason };

	return {
		accepted: true,
		deck: {
			source: "ygoprodeck",
			sourceId: deck.sourceId,
			category: category.category,
			url: deck.url,
			author: deck.author,
			name: deck.name,
			format: list.label,
			// The cover stays the source's passcode: it is only an image id.
			cover: deck.cover ?? lists.main[0],
			views: deck.views,
			main: lists.main,
			extra: lists.extra,
			side: lists.side,
			contentHash: deckContentHash(list.label, lists),
			sourceUpdatedAt: deck.sourceUpdatedAt,
		},
	};
}
