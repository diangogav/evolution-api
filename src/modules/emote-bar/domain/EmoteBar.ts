import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { DEFAULT_EMOTE_IDS, EmoteRef } from "./EmoteRef";

export const EMOTE_BAR_SLOTS = 8;

// A player's emote bar: exactly 8 distinct emotes, one per slot, in display order.
export class EmoteBar {
	private constructor(private readonly slots: readonly EmoteRef[]) {}

	static defaults(): EmoteBar {
		return EmoteBar.create(DEFAULT_EMOTE_IDS);
	}

	static create(refs: readonly string[]): EmoteBar {
		if (refs.length !== EMOTE_BAR_SLOTS) {
			throw new InvalidArgumentError(`Emote bar requires exactly ${EMOTE_BAR_SLOTS} slots`);
		}
		const parsed = refs.map((raw) => EmoteRef.parse(raw));
		const seen = new Set<string>();
		for (const ref of parsed) {
			if (seen.has(ref.toString())) {
				throw new InvalidArgumentError(`Emote bar repeats "${ref}"`);
			}
			seen.add(ref.toString());
		}
		return new EmoteBar(parsed);
	}

	refs(): readonly EmoteRef[] {
		return this.slots;
	}
}
