import { describe, expect, it } from "bun:test";

import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { SaveMyEmoteBar } from "../../../../../src/modules/emote-bar/application/SaveMyEmoteBar";
import { DEFAULT_EMOTE_IDS } from "../../../../../src/modules/emote-bar/domain/EmoteRef";
import { ForbiddenError } from "../../../../../src/shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { barsOf, cosmeticsOf, gatekeeperOf, grant, PACK_ID, pack } from "./fixtures";

function slotsWith(ref: string, index = 0): string[] {
	const slots = [...DEFAULT_EMOTE_IDS];
	slots[index] = ref;
	return slots;
}

function build(options: {
	cosmetics?: ReturnType<typeof pack>[];
	grants?: ReturnType<typeof grant>[];
}) {
	const bars = barsOf(null);
	const useCase = new SaveMyEmoteBar(
		cosmeticsOf(...(options.cosmetics ?? [pack()])),
		bars.repository,
		gatekeeperOf(...(options.grants ?? [grant(PACK_ID)])),
	);
	return { useCase, saved: bars.saved };
}

describe("SaveMyEmoteBar", () => {
	it("saves a bar of default emotes without looking at packs", async () => {
		const { useCase, saved } = build({ cosmetics: [], grants: [] });

		await useCase.run({ userId: "user-1", slots: [...DEFAULT_EMOTE_IDS].reverse() });

		expect(saved).toHaveLength(1);
		expect(saved[0].userId).toBe("user-1");
		expect(saved[0].bar.refs().map(String)).toEqual([...DEFAULT_EMOTE_IDS].reverse());
	});

	it("saves an emote of a pack the user holds a grant for", async () => {
		const { useCase, saved } = build({});
		const slots = slotsWith("halloween/ghost", 3);

		await useCase.run({ userId: "user-1", slots });

		expect(saved[0].bar.refs().map(String)).toEqual(slots);
	});

	it("rejects an emote of a pack the user cannot use", async () => {
		const { useCase, saved } = build({ grants: [] });

		await expect(
			useCase.run({ userId: "user-1", slots: slotsWith("halloween/ghost") }),
		).rejects.toBeInstanceOf(ForbiddenError);
		expect(saved).toHaveLength(0);
	});

	it("rejects an emote of a pack whose grant expired", async () => {
		const { useCase } = build({ grants: [grant(PACK_ID, new Date(Date.now() - 1000))] });

		await expect(
			useCase.run({ userId: "user-1", slots: slotsWith("halloween/ghost") }),
		).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("accepts an emote of a pack the user's tier already covers", async () => {
		const { useCase, saved } = build({
			cosmetics: [pack({ tier: CosmeticTier.STANDARD })],
			grants: [],
		});

		await useCase.run({ userId: "user-1", slots: slotsWith("halloween/ghost") });

		expect(saved).toHaveLength(1);
	});

	it.each([
		["an unknown pack", slotsWith("nope/ghost"), "nope/ghost"],
		["a key missing from the pack", slotsWith("halloween/zombie"), "halloween/zombie"],
		["the manifest as an emote key", slotsWith("halloween/pack"), "halloween/pack"],
		["a malformed ref", slotsWith("Halloween/Ghost"), "Halloween/Ghost"],
		["an unknown default id", slotsWith("dance"), "dance"],
	])("rejects %s naming the ref", async (_label, slots, ref) => {
		const { useCase, saved } = build({});

		const attempt = useCase.run({ userId: "user-1", slots });

		await expect(attempt).rejects.toBeInstanceOf(InvalidArgumentError);
		await expect(attempt).rejects.toThrow(ref);
		expect(saved).toHaveLength(0);
	});

	it("rejects an emote of an inactive pack", async () => {
		const { useCase } = build({ cosmetics: [pack({ active: false })] });

		await expect(
			useCase.run({ userId: "user-1", slots: slotsWith("halloween/ghost") }),
		).rejects.toBeInstanceOf(InvalidArgumentError);
	});

	it("ignores cosmetics of another type that share the folder name", async () => {
		const { useCase } = build({
			cosmetics: [pack({ type: CosmeticType.SLEEVE })],
		});

		await expect(
			useCase.run({ userId: "user-1", slots: slotsWith("halloween/ghost") }),
		).rejects.toBeInstanceOf(InvalidArgumentError);
	});

	it("rejects a bar with the wrong size or a repeated emote", async () => {
		const { useCase, saved } = build({});

		await expect(useCase.run({ userId: "user-1", slots: ["wave"] })).rejects.toBeInstanceOf(
			InvalidArgumentError,
		);
		await expect(
			useCase.run({ userId: "user-1", slots: slotsWith("wave", 1) }),
		).rejects.toBeInstanceOf(InvalidArgumentError);
		expect(saved).toHaveLength(0);
	});
});
