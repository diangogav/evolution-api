import { describe, expect, it } from "bun:test";

import { lightningAchievements } from "../../../../../src/modules/lightning/domain/lightningAchievements";

describe("lightningAchievements", () => {
	it("gives every ranked player the first-tournament achievement", () => {
		expect(lightningAchievements({ position: 9, losses: 4, priorWins: 0 })).toEqual([
			"LIGHTNING_FIRST",
		]);
	});

	it("adds the podium for the top three", () => {
		expect(lightningAchievements({ position: 3, losses: 1, priorWins: 0 })).toEqual([
			"LIGHTNING_FIRST",
			"LIGHTNING_PODIUM",
		]);
		expect(lightningAchievements({ position: 4, losses: 1, priorWins: 0 })).not.toContain(
			"LIGHTNING_PODIUM",
		);
	});

	it("adds the championship for the winner, and unbeaten only without a loss", () => {
		expect(lightningAchievements({ position: 1, losses: 1, priorWins: 0 })).toEqual([
			"LIGHTNING_FIRST",
			"LIGHTNING_PODIUM",
			"LIGHTNING_CHAMPION",
		]);
		expect(lightningAchievements({ position: 1, losses: 0, priorWins: 0 })).toEqual([
			"LIGHTNING_FIRST",
			"LIGHTNING_PODIUM",
			"LIGHTNING_CHAMPION",
			"LIGHTNING_UNBEATEN",
		]);
	});

	it("never calls a player below first unbeaten", () => {
		expect(lightningAchievements({ position: 2, losses: 0, priorWins: 0 })).not.toContain(
			"LIGHTNING_UNBEATEN",
		);
	});

	it("adds five-time champion on the fifth win, and on later wins in case it was missed", () => {
		expect(lightningAchievements({ position: 1, losses: 2, priorWins: 3 })).not.toContain(
			"LIGHTNING_CHAMPION_5",
		);
		expect(lightningAchievements({ position: 1, losses: 2, priorWins: 4 })).toContain(
			"LIGHTNING_CHAMPION_5",
		);
		expect(lightningAchievements({ position: 1, losses: 2, priorWins: 7 })).toContain(
			"LIGHTNING_CHAMPION_5",
		);
		expect(lightningAchievements({ position: 2, losses: 2, priorWins: 9 })).not.toContain(
			"LIGHTNING_CHAMPION_5",
		);
	});
});
