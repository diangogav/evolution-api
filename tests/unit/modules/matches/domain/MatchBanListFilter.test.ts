import { describe, expect, it } from "bun:test";

import { MatchBanListFilters } from "../../../../../src/modules/match/domain/MatchBanListFilter";

describe("MatchBanListFilters", () => {
	it("filters by the requested name when it has no rank", () => {
		const filter = MatchBanListFilters.resolve({ banListName: "2026.05 TCG", rank: null });

		expect(filter).toEqual({ type: "name", banListName: "2026.05 TCG" });
	});

	it("filters by the requested name when the rank is a ban list", () => {
		const filter = MatchBanListFilters.resolve({
			banListName: "March 2010 Edison",
			rank: { type: "banlist", patterns: [] },
		});

		expect(filter).toEqual({ type: "name", banListName: "March 2010 Edison" });
	});

	it("expands a group rank into its member patterns", () => {
		const filter = MatchBanListFilters.resolve({
			banListName: "Edison",
			rank: { type: "group", patterns: ["* Edison", "Goat Format"] },
		});

		expect(filter).toEqual({ type: "patterns", patterns: ["* Edison", "Goat Format"] });
	});

	it("filters nothing for a global rank", () => {
		const filter = MatchBanListFilters.resolve({
			banListName: "Global",
			rank: { type: "global", patterns: [] },
		});

		expect(filter).toEqual({ type: "all" });
	});
});
