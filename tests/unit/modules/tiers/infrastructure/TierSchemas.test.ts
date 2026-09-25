import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import {
	DAILY_OPPONENT_CAP,
	TIER_CATALOG,
} from "../../../../../src/modules/tiers/domain/TierCatalog";
import {
	RankedTierCatalogSchema,
	TierDefinitionSchema,
	TierIdSchema,
	TierProgressSchema,
	TierViewSchema,
} from "../../../../../src/modules/tiers/infrastructure/TierSchemas";

const goldProgress = {
	nextTierId: "platinum",
	unit: "points",
	current: 17,
	target: 25,
	distinctOpponentWins: { current: 4, required: 5 },
};

const goldView = {
	id: "gold",
	name: "Gold",
	effectivePoints: 17,
	gamesPlayed: 34,
	progress: goldProgress,
};

describe("TierIdSchema", () => {
	it("accepts the seven ladder ids and nothing else", () => {
		for (const tier of TIER_CATALOG.defaults.tiers)
			expect(Value.Check(TierIdSchema, tier.id)).toBe(true);
		expect(Value.Check(TierIdSchema, "legend")).toBe(false);
	});
});

describe("TierProgressSchema", () => {
	it("accepts games-based Rookie progress and points-based progress with the opponent gate", () => {
		const rookie = {
			nextTierId: "bronze",
			unit: "games",
			current: 3,
			target: 5,
			distinctOpponentWins: null,
		};

		expect(Value.Check(TierProgressSchema, rookie)).toBe(true);
		expect(Value.Check(TierProgressSchema, goldProgress)).toBe(true);
	});

	it("rejects an unknown unit and a bare number for the opponent gate", () => {
		expect(Value.Check(TierProgressSchema, { ...goldProgress, unit: "elo" })).toBe(false);
		expect(Value.Check(TierProgressSchema, { ...goldProgress, distinctOpponentWins: 4 })).toBe(
			false,
		);
	});
});

describe("TierViewSchema", () => {
	it("accepts a Master view carrying rating and peak with null progress", () => {
		const master = {
			id: "master",
			name: "Master",
			effectivePoints: 52,
			gamesPlayed: 61,
			progress: null,
			rating: 1210,
			peak: 1250,
		};

		expect(Value.Check(TierViewSchema, master)).toBe(true);
	});

	it("accepts a Gold view without rating and peak", () => {
		expect(Value.Check(TierViewSchema, goldView)).toBe(true);
	});

	it("accepts a Diamond view whose progress is null", () => {
		const diamond = {
			id: "diamond",
			name: "Diamond",
			effectivePoints: 44,
			gamesPlayed: 50,
			progress: null,
		};

		expect(Value.Check(TierViewSchema, diamond)).toBe(true);
	});

	it("rejects an unknown tier id, a missing games count and a non-numeric rating", () => {
		const { gamesPlayed: _dropped, ...withoutGames } = goldView;

		expect(Value.Check(TierViewSchema, { ...goldView, id: "legend" })).toBe(false);
		expect(Value.Check(TierViewSchema, withoutGames)).toBe(false);
		expect(Value.Check(TierViewSchema, { ...goldView, rating: "1210" })).toBe(false);
	});
});

describe("TierDefinitionSchema and RankedTierCatalogSchema", () => {
	const catalog = {
		banListName: null,
		dailyOpponentCap: DAILY_OPPONENT_CAP,
		dayBoundary: "UTC",
		tiers: TIER_CATALOG.defaults.tiers,
	};

	it("accepts every default tier definition", () => {
		for (const tier of TIER_CATALOG.defaults.tiers) {
			expect(Value.Check(TierDefinitionSchema, tier)).toBe(true);
		}
	});

	it("accepts the default catalog payload with and without a rank name", () => {
		expect(Value.Check(RankedTierCatalogSchema, catalog)).toBe(true);
		expect(Value.Check(RankedTierCatalogSchema, { ...catalog, banListName: "TCG" })).toBe(true);
	});

	it("rejects a non-UTC day boundary and a tier with a string threshold", () => {
		const [rookie, ...rest] = catalog.tiers;

		expect(Value.Check(RankedTierCatalogSchema, { ...catalog, dayBoundary: "local" })).toBe(false);
		expect(
			Value.Check(RankedTierCatalogSchema, {
				...catalog,
				tiers: [{ ...rookie, threshold: "3" }, ...rest],
			}),
		).toBe(false);
	});
});
