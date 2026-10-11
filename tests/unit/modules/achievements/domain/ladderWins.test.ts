import { describe, expect, it } from "bun:test";

import { ladderWins } from "../../../../../src/modules/achievements/domain/ladderWins";

const groups = [
	{ name: "TCG", patterns: ["* TCG"] },
	{ name: "OCG", patterns: ["* OCG"] },
	{ name: "Edison", patterns: ["* Edison", "Edison"] },
];

describe("ladderWins", () => {
	it("is all false without winning ban lists", () => {
		expect(ladderWins([], groups)).toEqual({
			TCG: false,
			OCG: false,
			Edison: false,
			JTP: false,
			Genesys: false,
		});
	});

	it("counts a win on a dated list for the group whose pattern matches it", () => {
		const result = ladderWins(["2026.09 TCG"], groups);

		expect(result.TCG).toBe(true);
		expect(result.OCG).toBe(false);
	});

	it("counts a win on a ban list that is itself a ladder name", () => {
		const result = ladderWins(["JTP", "Genesys"], groups);

		expect(result.JTP).toBe(true);
		expect(result.Genesys).toBe(true);
		expect(result.Edison).toBe(false);
	});

	it("feeds every group a list belongs to and ignores unrelated names", () => {
		const result = ladderWins(["2010.03 Edison", "Casual Lounge", "N/A"], groups);

		expect(result).toEqual({ TCG: false, OCG: false, Edison: true, JTP: false, Genesys: false });
	});

	it("does not let a suffix pattern match a name that merely contains it", () => {
		expect(ladderWins(["TCG Fun"], groups).TCG).toBe(false);
	});
});
