import { describe, expect, it } from "bun:test";

import { GetMyEmoteBar } from "../../../../../src/modules/emote-bar/application/GetMyEmoteBar";
import { EmoteBar } from "../../../../../src/modules/emote-bar/domain/EmoteBar";
import { DEFAULT_EMOTE_IDS } from "../../../../../src/modules/emote-bar/domain/EmoteRef";
import { barsOf, cosmeticsOf, gatekeeperOf, grant, PACK_ID, pack, signer } from "./fixtures";

function barWith(...overrides: Array<[number, string]>): EmoteBar {
	const refs = [...DEFAULT_EMOTE_IDS];
	for (const [index, ref] of overrides) refs[index] = ref;
	return EmoteBar.create(refs);
}

function build(options: {
	bar: EmoteBar | null;
	cosmetics?: ReturnType<typeof pack>[];
	grants?: ReturnType<typeof grant>[];
}) {
	return new GetMyEmoteBar(
		cosmeticsOf(...(options.cosmetics ?? [pack()])),
		barsOf(options.bar).repository,
		gatekeeperOf(...(options.grants ?? [grant(PACK_ID)])),
		signer,
	);
}

const DEFAULT_SLOT = { packId: null, assetUrl: null, packUrl: null, assetsExpiresAt: null };

describe("GetMyEmoteBar", () => {
	it("returns the default bar when nothing was saved", async () => {
		const result = await build({ bar: null }).run("user-1");

		expect(result.slots.map((slot) => slot.ref)).toEqual([...DEFAULT_EMOTE_IDS]);
		expect(result.slots.every((slot) => slot.packId === null && slot.assetUrl === null)).toBe(true);
	});

	it("carries no URL for default emotes", async () => {
		const result = await build({ bar: barWith() }).run("user-1");

		expect(result.slots[0]).toEqual({ ref: "wave", ...DEFAULT_SLOT });
	});

	it("signs the emote file and the pack manifest for a pack emote", async () => {
		const bar = barWith([2, "halloween/ghost"]);

		const result = await build({ bar }).run("user-1");

		expect(result.slots[2]).toEqual({
			ref: "halloween/ghost",
			packId: PACK_ID,
			assetUrl: "signed:emote-packs/halloween/ghost.json",
			packUrl: "signed:emote-packs/halloween/pack.json",
			assetsExpiresAt: "2030-01-01T00:00:00.000Z",
		});
	});

	it.each([
		["the pack is inactive", { cosmetics: [pack({ active: false })] }],
		["the pack no longer exists", { cosmetics: [] }],
		["the entitlement is gone", { grants: [] }],
		["the entitlement expired", { grants: [grant(PACK_ID, new Date(Date.now() - 1000))] }],
		["the key left the pack files", { cosmetics: [pack({ assetFiles: ["pack.json"] })] }],
	])("falls back to the default emote of the slot when %s", async (_label, options) => {
		const bar = barWith([2, "halloween/ghost"], [5, "halloween/bat"]);

		const result = await build({ bar, ...options }).run("user-1");

		expect(result.slots[2]).toEqual({ ref: "fire", ...DEFAULT_SLOT });
		expect(result.slots[5]).toEqual({ ref: "mindblown", ...DEFAULT_SLOT });
	});

	it("keeps usable pack slots when only some are stale", async () => {
		const bar = barWith([0, "halloween/ghost"], [1, "gone/emote"]);

		const result = await build({ bar }).run("user-1");

		expect(result.slots[0].ref).toBe("halloween/ghost");
		expect(result.slots[1]).toEqual({ ref: "wave", ...DEFAULT_SLOT });
	});

	it("never repeats a default when a stale slot falls back", async () => {
		const bar = barWith([0, "fire"], [2, "halloween/ghost"]);

		const result = await build({ bar, cosmetics: [] }).run("user-1");

		const refs = result.slots.map((slot) => slot.ref);
		expect(refs).toEqual([
			"fire",
			"thumbsup",
			"wave",
			"thinking",
			"cool",
			"mindblown",
			"sweat",
			"cry",
		]);
		expect(new Set(refs).size).toBe(8);
	});

	it("gives each of several stale slots a different unused default", async () => {
		const bar = barWith(
			[0, "halloween/ghost"],
			[1, "halloween/bat"],
			[4, "gone/emote"],
			[7, "gone/other"],
		);

		const result = await build({ bar, cosmetics: [] }).run("user-1");

		const refs = result.slots.map((slot) => slot.ref);
		expect(refs).toEqual([
			"wave",
			"thumbsup",
			"fire",
			"thinking",
			"cool",
			"mindblown",
			"sweat",
			"cry",
		]);
		expect(new Set(refs).size).toBe(8);
	});

	it("reads stored refs that are no longer valid as stale slots", async () => {
		const stored = [
			"removed-default",
			"Not/A/Ref",
			"fire",
			"halloween/ghost",
			"cool",
			"mindblown",
			"sweat",
			"cry",
		];
		const useCase = new GetMyEmoteBar(
			cosmeticsOf(pack()),
			barsOf(stored).repository,
			gatekeeperOf(grant(PACK_ID)),
			signer,
		);

		const result = await useCase.run("user-1");

		expect(result.slots.map((slot) => slot.ref)).toEqual([
			"wave",
			"thumbsup",
			"fire",
			"halloween/ghost",
			"cool",
			"mindblown",
			"sweat",
			"cry",
		]);
	});

	it("reads a stored array of the wrong length as the default bar", async () => {
		const useCase = new GetMyEmoteBar(
			cosmeticsOf(pack()),
			barsOf(["wave", "fire"]).repository,
			gatekeeperOf(),
			signer,
		);

		const result = await useCase.run("user-1");

		expect(result.slots.map((slot) => slot.ref)).toEqual([...DEFAULT_EMOTE_IDS]);
	});

	it("reads repeated stored refs as one slot plus fallbacks", async () => {
		const stored = ["wave", "wave", ...DEFAULT_EMOTE_IDS.slice(2)];
		const useCase = new GetMyEmoteBar(
			cosmeticsOf(pack()),
			barsOf(stored).repository,
			gatekeeperOf(),
			signer,
		);

		const result = await useCase.run("user-1");

		expect(result.slots.map((slot) => slot.ref)).toEqual([...DEFAULT_EMOTE_IDS]);
	});

	it("resolves the bar for whichever user id it is asked about", async () => {
		const seen: string[] = [];
		const bars = barsOf(barWith());
		const useCase = new GetMyEmoteBar(
			cosmeticsOf(pack()),
			{ ...bars.repository, findByUserId: async (id) => (seen.push(id), null) },
			gatekeeperOf(),
			signer,
		);

		await useCase.run("someone-else");

		expect(seen).toEqual(["someone-else"]);
	});
});
