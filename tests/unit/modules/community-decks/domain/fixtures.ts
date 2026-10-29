import type { CardAlternates } from "../../../../../src/modules/community-decks/domain/CardAlternates";
import type { FormatList } from "../../../../../src/modules/community-decks/domain/FormatList";
import type { SourceDeck } from "../../../../../src/modules/community-decks/domain/SourceDeck";

export const PRE_ERRATA_PAIRS = [
	{ card: "Armory Arm", original: 29071332, alternate: 910003009 },
	{ card: "Necrovalley", original: 47355498, alternate: 910003011 },
	{ card: "Quickdraw Synchron", original: 20932152, alternate: 910003005 },
	{ card: "Brionac, Dragon of the Ice Barrier", original: 50321796, alternate: 511002993 },
	{ card: "Goyo Guardian", original: 7391448, alternate: 511002994 },
] as const;

export const alternates: CardAlternates = new Map<number, readonly number[]>([
	...PRE_ERRATA_PAIRS.map(({ original, alternate }) => [original, [alternate]] as const),
	// An alternate artwork: both prints share one card for copy limits.
	[46986414, [36996508]],
]);

// Distinct filler passcodes no rule in these tests restricts.
export const filler = (count: number, from = 1000): number[] =>
	Array.from({ length: count }, (_, index) => from + index);

export const whitelist = (
	entries: Array<[number, number]>,
	label = "2010.3 Edison",
): FormatList => ({
	label,
	whitelist: true,
	limits: new Map(entries),
});

export const blacklist = (entries: Array<[number, number]>, label = "2026.9 TCG"): FormatList => ({
	label,
	whitelist: false,
	limits: new Map(entries),
});

export const edisonList = (extra: Array<[number, number]> = []): FormatList =>
	whitelist([
		...filler(60).map((id) => [id, 3] as [number, number]),
		...filler(15, 5000).map((id) => [id, 3] as [number, number]),
		...PRE_ERRATA_PAIRS.map(({ alternate }) => [alternate, 1] as [number, number]),
		[46986414, 3],
		...extra,
	]);

export const sourceDeck = (overrides: Partial<SourceDeck> = {}): SourceDeck => ({
	sourceId: "741607",
	name: "Fairies",
	author: "someone",
	url: "https://ygoprodeck.com/deck/fairies-741607",
	cover: 1000,
	main: filler(40),
	extra: [],
	side: [],
	views: 500,
	sourceUpdatedAt: null,
	...overrides,
});
