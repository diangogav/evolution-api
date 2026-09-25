import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { GetTierCatalog } from "../../../../../src/modules/tiers/application/GetTierCatalog";
import {
	DAILY_OPPONENT_CAP,
	TIER_CATALOG,
	type TierCatalog,
	type TierId,
} from "../../../../../src/modules/tiers/domain/TierCatalog";
import { RankedTierCatalogSchema } from "../../../../../src/modules/tiers/infrastructure/TierSchemas";

const LADDER_IDS: TierId[] = [
	"rookie",
	"bronze",
	"silver",
	"gold",
	"platinum",
	"diamond",
	"master",
];

/** The default ladder plus one themed rank, so overrides are observable without touching the shipped constant. */
const themed: TierCatalog = {
	defaults: TIER_CATALOG.defaults,
	overrides: {
		Halloween: { gold: { name: "Pumpkin", icon: "tier-pumpkin" }, diamond: { threshold: 50 } },
	},
};

describe("GetTierCatalog", () => {
	it("wraps the default ladder with a null rank name, the daily cap and the UTC day boundary when no rank is requested", () => {
		const view = new GetTierCatalog().run();

		expect(Object.keys(view)).toEqual(["banListName", "dailyOpponentCap", "dayBoundary", "tiers"]);
		expect(view.banListName).toBeNull();
		expect(view.dailyOpponentCap).toBe(DAILY_OPPONENT_CAP);
		expect(view.dayBoundary).toBe("UTC");
		expect(view.tiers.map((tier) => tier.id)).toEqual(LADDER_IDS);
		expect(view.tiers.map((tier) => tier.threshold)).toEqual([null, null, 3, 10, 25, 40, null]);
		expect(view.tiers.map((tier) => tier.kind)).toEqual([
			"placement",
			"absolute",
			"absolute",
			"absolute",
			"absolute",
			"absolute",
			"relative",
		]);
	});

	it("echoes the requested rank name and keeps the default ladder for a rank without overrides", () => {
		const view = new GetTierCatalog().run("TCG");

		expect(view.banListName).toBe("TCG");
		expect(view.tiers).toEqual(TIER_CATALOG.defaults.tiers);
	});

	it("applies a rank's overrides server-side and never exposes the overrides map", () => {
		const useCase = new GetTierCatalog(themed);

		const halloween = useCase.run("Halloween");
		const tcg = useCase.run("TCG");

		expect(halloween.banListName).toBe("Halloween");
		expect(halloween.tiers.map((tier) => tier.id)).toEqual(LADDER_IDS);
		expect(halloween.tiers[3]).toMatchObject({ id: "gold", name: "Pumpkin", icon: "tier-pumpkin" });
		expect(halloween.tiers[5]).toMatchObject({ id: "diamond", threshold: 50 });
		expect(halloween).not.toHaveProperty("overrides");
		expect(tcg.tiers[3]).toMatchObject({ id: "gold", name: "Gold", icon: "tier-gold" });
		expect(tcg.tiers[5]).toMatchObject({ id: "diamond", threshold: 40 });
	});

	it("produces a payload the catalog response schema accepts, with and without a rank name", () => {
		const useCase = new GetTierCatalog(themed);

		for (const view of [useCase.run(), useCase.run("TCG"), useCase.run("Halloween")]) {
			expect(Value.Check(RankedTierCatalogSchema, view)).toBe(true);
		}
	});
});
