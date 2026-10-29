import type { FormatList } from "./FormatList";
import { MAX_COPIES } from "./FormatList";

/** Original passcode → the ids whose cdb `alias` is that passcode (errata copies, artworks). */
export type CardAlternates = ReadonlyMap<number, readonly number[]>;

// Alternate → original, so an alternate shares its original's copy limit.
export function originalsOf(alternates: CardAlternates): Map<number, number> {
	const originals = new Map<number, number>();
	for (const [original, ids] of alternates) {
		for (const id of ids) originals.set(id, original);
	}
	return originals;
}

// A listed card answers with its own limit. An unlisted card is forbidden by a whitelist;
// under any other list it inherits its original's limit, so a banned card's alternate
// artwork stays banned, and is otherwise free up to three copies.
export function limitOf(
	card: number,
	list: FormatList,
	originals: ReadonlyMap<number, number>,
): number {
	const own = list.limits.get(card);
	if (own !== undefined) return Math.min(own, MAX_COPIES);
	if (list.whitelist) return 0;
	const original = originals.get(card);
	const inherited = original === undefined ? undefined : list.limits.get(original);
	return Math.min(inherited ?? MAX_COPIES, MAX_COPIES);
}
