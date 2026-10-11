import { describe, expect, it } from "bun:test";

import {
	type AchievementRequirement,
	requirementFromCode,
} from "../../../../../src/modules/achievements/domain/AchievementRequirement";

describe("requirementFromCode", () => {
	it.each<[string, AchievementRequirement]>([
		["first_win", { metric: "rankedWins", target: 1 }],
		["wins_10", { metric: "rankedWins", target: 10 }],
		["wins_50", { metric: "rankedWins", target: 50 }],
		["wins_100", { metric: "rankedWins", target: 100 }],
		["streak_3", { metric: "currentStreak", target: 3 }],
		["streak_5", { metric: "currentStreak", target: 5 }],
		["streak_10", { metric: "currentStreak", target: 10 }],
		["matches_100", { metric: "rankedMatches", target: 100 }],
		["format_first_win:TCG", { metric: "ladderFirstWin", target: 1, ladder: "TCG" }],
		["format_first_win:OCG", { metric: "ladderFirstWin", target: 1, ladder: "OCG" }],
		["format_first_win:Edison", { metric: "ladderFirstWin", target: 1, ladder: "Edison" }],
		["format_first_win:JTP", { metric: "ladderFirstWin", target: 1, ladder: "JTP" }],
		["format_first_win:Genesys", { metric: "ladderFirstWin", target: 1, ladder: "Genesys" }],
	])("derives the requirement of %s", (code, expected) => {
		expect(requirementFromCode(code)).toEqual(expected);
	});

	it.each([
		"tournament_champion",
		"wins_",
		"wins_abc",
		"wins_0",
		"streak_-1",
		"format_first_win:",
		"",
	])("returns null for the unknown code %p", (code) => {
		expect(requirementFromCode(code)).toBeNull();
	});
});
