import { describe, expect, it } from "bun:test";

import type { EventDefinition } from "../../../../src/modules/event-run";
import { buildCosmeticUsage } from "../../../../src/server/composition/buildCosmeticUsage";

const event = (id: string, name: string, prizes: string[][]): EventDefinition => ({
	id,
	name: { en: name },
	description: { en: "" },
	format: "edison",
	startsAt: new Date("2026-10-01T00:00:00Z"),
	endsAt: new Date("2026-11-01T00:00:00Z"),
	attemptsPerDay: 3,
	waves: [],
	decks: [],
	prizeTiers: prizes.map((cosmeticIds, index) => ({
		wavesCleared: index + 1,
		essence: 100,
		cosmeticIds,
	})),
});

describe("buildCosmeticUsage", () => {
	it("gathers the bots that wear a cosmetic and the events that give it away", async () => {
		const source = buildCosmeticUsage(
			{
				list: async () => [
					{ botName: "Lich", cosmeticId: "sleeve-1" },
					{ botName: "Gravekeepers", cosmeticId: "sleeve-1" },
					{ botName: "Lich", cosmeticId: "avatar-1" },
				],
			},
			{
				list: async () => [
					// The same cosmetic in two tiers of one event is one prize of that event.
					event("halloween-2026", "Halloween Gauntlet", [["sleeve-1"], ["sleeve-1", "pack-1"]]),
					event("winter-2026", "Winter Gauntlet", [["pack-1"]]),
				],
			},
		);

		const usage = await source.usage();

		expect(usage.get("sleeve-1")).toEqual({
			bots: ["Lich", "Gravekeepers"],
			prizeOf: [{ eventId: "halloween-2026", name: "Halloween Gauntlet" }],
		});
		expect(usage.get("avatar-1")).toEqual({ bots: ["Lich"], prizeOf: [] });
		expect(usage.get("pack-1")).toEqual({
			bots: [],
			prizeOf: [
				{ eventId: "halloween-2026", name: "Halloween Gauntlet" },
				{ eventId: "winter-2026", name: "Winter Gauntlet" },
			],
		});
		expect(usage.has("unused")).toBe(false);
	});
});
