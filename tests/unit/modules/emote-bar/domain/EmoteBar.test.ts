import { describe, expect, it } from "bun:test";

import { EmoteBar } from "../../../../../src/modules/emote-bar/domain/EmoteBar";
import { DEFAULT_EMOTE_IDS } from "../../../../../src/modules/emote-bar/domain/EmoteRef";

describe("EmoteBar", () => {
	it("defaults to the bundled emotes in order", () => {
		expect(EmoteBar.defaults().refs().map(String)).toEqual([...DEFAULT_EMOTE_IDS]);
	});

	it("keeps the order of the refs it is built from", () => {
		const refs = ["pack/a", "cry", "pack/b", "wave", "fire", "cool", "sweat", "thumbsup"];

		expect(EmoteBar.create(refs).refs().map(String)).toEqual(refs);
	});

	it("rejects a bar that does not hold exactly 8 slots", () => {
		expect(() => EmoteBar.create(["wave"])).toThrow("Emote bar requires exactly 8 slots");
		expect(() => EmoteBar.create([...DEFAULT_EMOTE_IDS, "pack/a"])).toThrow(
			"Emote bar requires exactly 8 slots",
		);
	});

	it("rejects a repeated emote", () => {
		const refs = [...DEFAULT_EMOTE_IDS.slice(0, 7), "wave"];

		expect(() => EmoteBar.create(refs)).toThrow('Emote bar repeats "wave"');
	});

	it("rejects a malformed ref naming it", () => {
		const refs = [...DEFAULT_EMOTE_IDS.slice(0, 7), "Bad/Ref"];

		expect(() => EmoteBar.create(refs)).toThrow('Invalid emote reference "Bad/Ref"');
	});
});
