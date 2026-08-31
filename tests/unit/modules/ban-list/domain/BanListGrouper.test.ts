import { describe, expect, it } from "bun:test";

import { BanListGrouper } from "../../../../../src/modules/ban-list/domain/BanListGrouper";
import {
	RankMemberPattern,
	RankSummary,
} from "../../../../../src/modules/ban-list/domain/BanListSection";

const globalRank: RankSummary = { id: "rank-global", name: "Global", type: "global" };

function group(id: string, name: string): RankSummary {
	return { id, name, type: "group" };
}

function banList(name: string): RankSummary {
	return { id: `rank-${name}`, name, type: "banlist" };
}

function pattern(rankId: string, value: string): RankMemberPattern {
	return { rankId, pattern: value };
}

describe("BanListGrouper", () => {
	describe("pattern matching", () => {
		it('matches every ban list whose name ends with " X" for a "* X" pattern', () => {
			const ranks = [group("rank-tcg", "TCG"), banList("2026.05 TCG"), banList("2025.10 TCG")];

			const sections = BanListGrouper.group(ranks, [pattern("rank-tcg", "* TCG")]);

			expect(sections).toEqual([
				{ name: "TCG", type: "group", banLists: ["2025.10 TCG", "2026.05 TCG"] },
			]);
		});

		it('does not match names that only contain the "* X" suffix word', () => {
			const ranks = [
				group("rank-tcg", "TCG"),
				banList("TCG Extra"),
				banList("Retro TCG Edison"),
				banList("MyTCG"),
				banList("TCG"),
			];

			const sections = BanListGrouper.group(ranks, [pattern("rank-tcg", "* TCG")]);

			expect(sections[0]).toEqual({ name: "TCG", type: "group", banLists: [] });
		});

		it("matches a ban list against every pattern registered for the same group", () => {
			const ranks = [group("rank-retro", "Retro"), banList("Goat"), banList("2010.03 Edison")];

			const sections = BanListGrouper.group(ranks, [
				pattern("rank-retro", "Goat"),
				pattern("rank-retro", "* Edison"),
			]);

			expect(sections).toEqual([
				{ name: "Retro", type: "group", banLists: ["2010.03 Edison", "Goat"] },
			]);
		});

		it('matches exactly when the pattern does not start with "* "', () => {
			const ranks = [
				group("rank-edison", "Edison"),
				banList("Edison"),
				banList("March 2010 Edison"),
				banList("Edison Format"),
			];

			const sections = BanListGrouper.group(ranks, [pattern("rank-edison", "Edison")]);

			expect(sections[0]).toEqual({ name: "Edison", type: "group", banLists: ["Edison"] });
		});
	});

	describe("section ordering", () => {
		it("returns the global section first, then groups and ungrouped ban lists alphabetically", () => {
			const ranks = [
				banList("Zombie"),
				group("rank-tcg", "TCG"),
				banList("Alpha"),
				globalRank,
				group("rank-edison", "Edison"),
			];

			const sections = BanListGrouper.group(ranks, []);

			expect(sections.map((section) => section.name)).toEqual([
				"Global",
				"Edison",
				"TCG",
				"Alpha",
				"Zombie",
			]);
			expect(sections.map((section) => section.type)).toEqual([
				"global",
				"group",
				"group",
				"banlist",
				"banlist",
			]);
		});
	});

	describe("grouping", () => {
		it("moves a matched ban list into its group and drops it from the top level", () => {
			const ranks = [globalRank, group("rank-edison", "Edison"), banList("March 2010 Edison")];

			const sections = BanListGrouper.group(ranks, [pattern("rank-edison", "* Edison")]);

			expect(sections).toEqual([
				{ name: "Global", type: "global", banLists: [] },
				{ name: "Edison", type: "group", banLists: ["March 2010 Edison"] },
			]);
		});

		it("keeps a ban list matched by two groups inside both groups and out of the top level", () => {
			const ranks = [
				group("rank-edison", "Edison"),
				group("rank-retro", "Retro"),
				banList("March 2010 Edison"),
			];

			const sections = BanListGrouper.group(ranks, [
				pattern("rank-edison", "* Edison"),
				pattern("rank-retro", "March 2010 Edison"),
			]);

			expect(sections).toEqual([
				{ name: "Edison", type: "group", banLists: ["March 2010 Edison"] },
				{ name: "Retro", type: "group", banLists: ["March 2010 Edison"] },
			]);
		});

		it("keeps an unmatched ban list as its own top level section with no members", () => {
			const ranks = [group("rank-edison", "Edison"), banList("Goat")];

			const sections = BanListGrouper.group(ranks, [pattern("rank-edison", "* Edison")]);

			expect(sections).toContainEqual({ name: "Goat", type: "banlist", banLists: [] });
		});

		it("renders a group with no matching ban lists as an empty section", () => {
			const ranks = [globalRank, group("rank-edison", "Edison"), banList("Goat")];

			const sections = BanListGrouper.group(ranks, [pattern("rank-edison", "* Edison")]);

			expect(sections).toEqual([
				{ name: "Global", type: "global", banLists: [] },
				{ name: "Edison", type: "group", banLists: [] },
				{ name: "Goat", type: "banlist", banLists: [] },
			]);
		});

		it("ignores patterns that belong to another group", () => {
			const ranks = [
				group("rank-edison", "Edison"),
				group("rank-tcg", "TCG"),
				banList("2026.05 TCG"),
			];

			const sections = BanListGrouper.group(ranks, [pattern("rank-tcg", "* TCG")]);

			expect(sections).toEqual([
				{ name: "Edison", type: "group", banLists: [] },
				{ name: "TCG", type: "group", banLists: ["2026.05 TCG"] },
			]);
		});
	});
});
