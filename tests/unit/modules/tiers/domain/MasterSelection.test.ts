import { describe, expect, it } from "bun:test";

import { ladderFor, TIER_CATALOG } from "../../../../../src/modules/tiers/domain/TierCatalog";
import {
	isMasterEligible,
	type MasterCandidate,
	selectMaster,
} from "../../../../../src/modules/tiers/domain/MasterSelection";
import { replayTier, type TierStanding } from "../../../../../src/modules/tiers/domain/TierReplay";
import { tcgWinTrading } from "../fixtures/season7Slices";

const ladder = ladderFor();

function standing(overrides: Partial<TierStanding> = {}): TierStanding {
	return {
		tierId: "platinum",
		grantedTierId: "platinum",
		effectivePoints: 30,
		gamesPlayed: 25,
		distinctOpponentWins: 6,
		progress: null,
		...overrides,
	};
}

const candidate = (userId: string, overrides: Partial<TierStanding> = {}): MasterCandidate => ({
	userId,
	standing: standing(overrides),
});

describe("isMasterEligible", () => {
	it("accepts a Platinum or Diamond player with at least twenty active games", () => {
		expect(isMasterEligible(standing({ gamesPlayed: 20 }), ladder)).toBe(true);
		expect(
			isMasterEligible(standing({ tierId: "diamond", grantedTierId: "diamond" }), ladder),
		).toBe(true);
	});

	it("rejects nineteen games even at Diamond", () => {
		const diamond = standing({ tierId: "diamond", grantedTierId: "diamond", gamesPlayed: 19 });

		expect(isMasterEligible(diamond, ladder)).toBe(false);
	});

	it("rejects a Gold player however many games and points they have", () => {
		const gold = standing({
			tierId: "gold",
			grantedTierId: "gold",
			gamesPlayed: 80,
			effectivePoints: 60,
		});

		expect(isMasterEligible(gold, ladder)).toBe(false);
		expect(isMasterEligible(replayTier(tcgWinTrading, ladder), ladder)).toBe(false);
	});

	it("judges the granted tier, so a Platinum floor holder demoted by Rookie count is still gated by games", () => {
		expect(isMasterEligible(standing({ tierId: "rookie", gamesPlayed: 4 }), ladder)).toBe(false);
	});

	it("judges the granted tier when it disagrees with the displayed one at twenty games", () => {
		const displayedBelowGrant = standing({
			tierId: "gold",
			grantedTierId: "platinum",
			gamesPlayed: 20,
		});
		const displayedAboveGrant = standing({
			tierId: "platinum",
			grantedTierId: "gold",
			gamesPlayed: 20,
		});

		expect(isMasterEligible(displayedBelowGrant, ladder)).toBe(true);
		expect(isMasterEligible(displayedAboveGrant, ladder)).toBe(false);
	});

	it("reads the game minimum from the ladder", () => {
		const stricter = ladderFor("Strict", {
			defaults: TIER_CATALOG.defaults,
			overrides: { Strict: { master: { minGames: 30 } } },
		});

		expect(isMasterEligible(standing({ gamesPlayed: 25 }), stricter)).toBe(false);
		expect(isMasterEligible(standing({ gamesPlayed: 30 }), stricter)).toBe(true);
	});
});

describe("selectMaster", () => {
	const six = ["A", "B", "C", "D", "E", "F"].map((id) => candidate(id));

	it("takes exactly the first five eligible candidates, never the sixth of a boundary tie", () => {
		expect(selectMaster(six, ladder)).toEqual(["A", "B", "C", "D", "E"]);
	});

	it("skips ineligible candidates without consuming a seat", () => {
		const ordered = [
			candidate("A"),
			candidate("X", { tierId: "gold", grantedTierId: "gold", gamesPlayed: 70 }),
			candidate("B"),
			candidate("Y", { gamesPlayed: 19 }),
			candidate("C"),
			candidate("D"),
			candidate("E"),
			candidate("F"),
		];

		expect(selectMaster(ordered, ladder)).toEqual(["A", "B", "C", "D", "E"]);
	});

	it("fills all five seats when exactly five are eligible", () => {
		expect(selectMaster(six.slice(0, 5), ladder)).toEqual(["A", "B", "C", "D", "E"]);
	});

	it("leaves Master empty with fewer than five eligible players, however many candidates", () => {
		const ineligible = Array.from({ length: 10 }, (_, i) =>
			candidate(`n${i}`, { tierId: "gold", grantedTierId: "gold" }),
		);

		expect(selectMaster(six.slice(0, 3), ladder)).toEqual([]);
		expect(selectMaster([...six.slice(0, 4), ...ineligible], ladder)).toEqual([]);
		expect(selectMaster([], ladder)).toEqual([]);
	});

	it("sizes the set from the ladder", () => {
		const trio = ladderFor("Trio", {
			defaults: TIER_CATALOG.defaults,
			overrides: { Trio: { master: { size: 3 } } },
		});

		expect(selectMaster(six, trio)).toEqual(["A", "B", "C"]);
	});
});
