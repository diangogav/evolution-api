import { describe, expect, it } from "bun:test";

import {
	DAILY_OPPONENT_CAP,
	DISTINCT_OPPONENT_WINS,
	MASTER_MIN_GAMES,
	MASTER_SIZE,
	ROOKIE_MIN_GAMES,
	TIER_CATALOG,
	ladderFor,
} from "../../../../../src/modules/tiers/domain/TierCatalog";

const LADDER_IDS = ["rookie", "bronze", "silver", "gold", "platinum", "diamond", "master"];

describe("TIER_CATALOG", () => {
	it("lists exactly the seven ladder ids in ladder order with matching order fields", () => {
		expect(TIER_CATALOG.defaults.tiers.map((tier) => tier.id)).toEqual(LADDER_IDS);
		expect(TIER_CATALOG.defaults.tiers.map((tier) => tier.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it("uses Master Duel style display names", () => {
		expect(TIER_CATALOG.defaults.tiers.map((tier) => tier.name)).toEqual([
			"Rookie",
			"Bronze",
			"Silver",
			"Gold",
			"Platinum",
			"Diamond",
			"Master",
		]);
	});

	it("sets thresholds 3/10/25/40 for silver..diamond and null for rookie, bronze and master", () => {
		expect(TIER_CATALOG.defaults.tiers.map((tier) => tier.threshold)).toEqual([
			null,
			null,
			3,
			10,
			25,
			40,
			null,
		]);
	});

	it("marks rookie as placement, bronze..diamond as absolute and master as relative", () => {
		expect(TIER_CATALOG.defaults.tiers.map((tier) => tier.kind)).toEqual([
			"placement",
			"absolute",
			"absolute",
			"absolute",
			"absolute",
			"absolute",
			"relative",
		]);
	});

	it("describes every gating rule as structured requirements", () => {
		const byId = Object.fromEntries(TIER_CATALOG.defaults.tiers.map((tier) => [tier.id, tier]));

		expect(byId.rookie.minGames).toBe(ROOKIE_MIN_GAMES);
		expect(byId.platinum.distinctOpponentWins).toBe(DISTINCT_OPPONENT_WINS);
		expect(byId.diamond.distinctOpponentWins).toBe(DISTINCT_OPPONENT_WINS);
		expect(byId.master).toMatchObject({
			minGames: MASTER_MIN_GAMES,
			requiresTier: "platinum",
			size: MASTER_SIZE,
		});
		expect(byId.gold).toMatchObject({
			minGames: null,
			distinctOpponentWins: null,
			requiresTier: null,
			size: null,
		});
	});

	it("names an icon per tier and carries the daily per-opponent cap", () => {
		expect(TIER_CATALOG.defaults.tiers.map((tier) => tier.icon)).toEqual(
			LADDER_IDS.map((id) => `tier-${id}`),
		);
		expect(TIER_CATALOG.defaults.dailyOpponentCap).toBe(DAILY_OPPONENT_CAP);
	});

	it("pins the rule constants the replay relies on", () => {
		expect([
			DAILY_OPPONENT_CAP,
			ROOKIE_MIN_GAMES,
			MASTER_MIN_GAMES,
			MASTER_SIZE,
			DISTINCT_OPPONENT_WINS,
		]).toEqual([2, 5, 20, 5, 5]);
	});
});

describe("ladderFor", () => {
	it("returns the default ladder when no rank name is given or the rank has no overrides", () => {
		expect(ladderFor()).toBe(TIER_CATALOG.defaults);
		expect(ladderFor("TCG")).toBe(TIER_CATALOG.defaults);
	});

	it("merges a rank's overrides over the default definitions, keeping the ladder order", () => {
		const catalog = {
			defaults: TIER_CATALOG.defaults,
			overrides: {
				Halloween: { gold: { name: "Pumpkin", icon: "tier-pumpkin" }, diamond: { threshold: 50 } },
			},
		};

		const ladder = ladderFor("Halloween", catalog);

		expect(ladder.tiers.map((tier) => tier.id)).toEqual(LADDER_IDS);
		expect(ladder.tiers[3]).toMatchObject({
			id: "gold",
			name: "Pumpkin",
			icon: "tier-pumpkin",
			threshold: 10,
		});
		expect(ladder.tiers[5]).toMatchObject({ id: "diamond", name: "Diamond", threshold: 50 });
		expect(ladder.dailyOpponentCap).toBe(DAILY_OPPONENT_CAP);
		expect(TIER_CATALOG.defaults.tiers[3].name).toBe("Gold");
	});
});
