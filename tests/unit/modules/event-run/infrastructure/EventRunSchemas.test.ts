import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { PrizeTierSchema } from "../../../../../src/modules/event-run/infrastructure/EventRunSchemas";

describe("PrizeTierSchema", () => {
	it("accepts a tier with described cosmetics and an essence-only tier", () => {
		const withCosmetic = {
			wavesCleared: 8,
			essence: 400,
			cosmeticIds: ["playmat-8", "gone"],
			cosmetics: [
				{
					id: "playmat-8",
					type: "PLAYMAT",
					name: "Graveyard",
					assets: { "background.webp": "https://signed/background.webp" },
					assetsExpiresAt: "2026-10-31T21:00:00.000Z",
				},
			],
		};
		const essenceOnly = { wavesCleared: 3, essence: 150, cosmeticIds: [], cosmetics: [] };

		expect(Value.Check(PrizeTierSchema, withCosmetic)).toBe(true);
		expect(Value.Check(PrizeTierSchema, essenceOnly)).toBe(true);
	});

	it("rejects a cosmetic of an unknown type", () => {
		const tier = {
			wavesCleared: 3,
			essence: 150,
			cosmeticIds: ["x"],
			cosmetics: [{ id: "x", type: "HAT", name: "Hat", assets: {} }],
		};

		expect(Value.Check(PrizeTierSchema, tier)).toBe(false);
	});
});
