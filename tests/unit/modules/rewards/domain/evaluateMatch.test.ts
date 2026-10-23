import { describe, expect, it } from "bun:test";

import {
	evaluateMatch,
	MatchFacts,
	RewardState,
} from "../../../../../src/modules/rewards/domain/evaluateMatch";
import { Mission, MissionRule } from "../../../../../src/modules/rewards/domain/Mission";

function mission(code: string, rule: MissionRule, period: Mission["period"] = "daily"): Mission {
	return {
		id: `id-${code}`,
		code,
		name: code,
		description: code,
		period,
		rule,
		reward: { type: "essence", amount: 20 },
		active: true,
		sortOrder: 0,
	};
}

function facts(overrides: Partial<MatchFacts> = {}): MatchFacts {
	return {
		gameId: "game-1",
		userId: "user-1",
		won: true,
		ranked: true,
		banListName: "2026.10 TCG",
		date: new Date("2026-10-23T10:00:00Z"),
		duels: [{ result: "winner", turns: 8 }],
		...overrides,
	};
}

function state(overrides: Partial<RewardState> = {}): RewardState {
	return { progress: {}, lastFormat: null, rankedStreak: 0, ...overrides };
}

const play3 = mission("play_3", { metric: "duelsPlayed", target: 3 });
const win1 = mission("win_1", { metric: "duelsWon", target: 1 });
const rankedPlay1 = mission("ranked_play_1", { metric: "rankedDuelsPlayed", target: 1 });
const winFast = mission("win_fast", { metric: "winUnder10Turns", target: 1 });
const winOtherFormat = mission("win_other_format", { metric: "winDifferentFormat", target: 1 });
const weeklyStreak3 = mission(
	"weekly_ranked_streak_3",
	{ metric: "rankedWinStreak", target: 3 },
	"weekly",
);
const weeklyPlay20 = mission("weekly_play_20", { metric: "duelsPlayed", target: 20 }, "weekly");

describe("evaluateMatch", () => {
	it("counts a played match toward play missions of both periods under their own period keys", () => {
		const { progress } = evaluateMatch(facts({ won: false }), state(), [play3, weeklyPlay20]);

		expect(progress).toEqual([
			{ missionCode: "play_3", periodKey: "2026-10-23", value: 1, completed: false },
			{ missionCode: "weekly_play_20", periodKey: "2026-W43", value: 1, completed: false },
		]);
	});

	it("marks a mission completed when the accumulated value reaches the target and caps it there", () => {
		const { progress } = evaluateMatch(facts(), state({ progress: { play_3: 2 } }), [play3]);
		expect(progress[0]).toEqual({
			missionCode: "play_3",
			periodKey: "2026-10-23",
			value: 3,
			completed: true,
		});

		const again = evaluateMatch(facts(), state({ progress: { play_3: 3 } }), [play3]);
		expect(again.progress[0].value).toBe(3);
	});

	it("counts wins only when the user won", () => {
		expect(evaluateMatch(facts({ won: false }), state(), [win1]).progress[0].value).toBe(0);
		expect(evaluateMatch(facts({ won: true }), state(), [win1]).progress[0].value).toBe(1);
	});

	it("counts ranked duels only for ranked matches", () => {
		expect(evaluateMatch(facts({ ranked: false }), state(), [rankedPlay1]).progress[0].value).toBe(
			0,
		);
		expect(evaluateMatch(facts({ ranked: true }), state(), [rankedPlay1]).progress[0].value).toBe(
			1,
		);
	});

	it("applies the optional ranked filter of a rule to any metric", () => {
		const rankedWin = mission("ranked_win_1", { metric: "duelsWon", target: 1, ranked: true });
		expect(evaluateMatch(facts({ ranked: false }), state(), [rankedWin]).progress[0].value).toBe(0);
		expect(evaluateMatch(facts({ ranked: true }), state(), [rankedWin]).progress[0].value).toBe(1);
	});

	it("credits a fast win when the user won the match and won any duel in 10 turns or fewer", () => {
		const slow = facts({
			duels: [
				{ result: "winner", turns: 11 },
				{ result: "winner", turns: 12 },
			],
		});
		expect(evaluateMatch(slow, state(), [winFast]).progress[0].value).toBe(0);

		const mixed = facts({
			duels: [
				{ result: "loser", turns: 5 },
				{ result: "winner", turns: 10 },
			],
		});
		expect(evaluateMatch(mixed, state(), [winFast]).progress[0].value).toBe(1);

		const lostFast = facts({
			won: false,
			duels: [
				{ result: "winner", turns: 4 },
				{ result: "loser", turns: 6 },
				{ result: "loser", turns: 7 },
			],
		});
		expect(evaluateMatch(lostFast, state(), [winFast]).progress[0].value).toBe(0);
	});

	it("credits a win in a different format than the user's previous match, regardless of period", () => {
		expect(
			evaluateMatch(facts(), state({ lastFormat: null }), [winOtherFormat]).progress[0].value,
		).toBe(0);
		expect(
			evaluateMatch(facts(), state({ lastFormat: "2026.10 TCG" }), [winOtherFormat]).progress[0]
				.value,
		).toBe(0);
		expect(
			evaluateMatch(facts(), state({ lastFormat: "Edison" }), [winOtherFormat]).progress[0].value,
		).toBe(1);
		expect(
			evaluateMatch(facts({ won: false }), state({ lastFormat: "Edison" }), [winOtherFormat])
				.progress[0].value,
		).toBe(0);
	});

	it("tracks the ranked win streak: a ranked loss resets it, an unranked match neither breaks nor extends it", () => {
		const afterWin = evaluateMatch(facts(), state({ rankedStreak: 2 }), [weeklyStreak3]);
		expect(afterWin.state.rankedStreak).toBe(3);
		expect(afterWin.progress[0]).toEqual({
			missionCode: "weekly_ranked_streak_3",
			periodKey: "2026-W43",
			value: 3,
			completed: true,
		});

		const afterLoss = evaluateMatch(facts({ won: false }), state({ rankedStreak: 2 }), [
			weeklyStreak3,
		]);
		expect(afterLoss.state.rankedStreak).toBe(0);
		expect(afterLoss.progress[0].value).toBe(0);

		const afterUnranked = evaluateMatch(facts({ ranked: false }), state({ rankedStreak: 2 }), [
			weeklyStreak3,
		]);
		expect(afterUnranked.state.rankedStreak).toBe(2);
		expect(afterUnranked.progress[0].value).toBe(2);
	});

	it("keeps a completed streak mission completed after the streak later breaks within the period", () => {
		const { progress } = evaluateMatch(
			facts({ won: false }),
			state({ rankedStreak: 3, progress: { weekly_ranked_streak_3: 3 } }),
			[weeklyStreak3],
		);
		expect(progress[0]).toEqual({
			missionCode: "weekly_ranked_streak_3",
			periodKey: "2026-W43",
			value: 3,
			completed: true,
		});
	});

	it("always records the match format as the new last format", () => {
		const { state: next } = evaluateMatch(
			facts({ banListName: "Edison" }),
			state({ lastFormat: "2026.10 TCG" }),
			[],
		);
		expect(next.lastFormat).toBe("Edison");
	});

	it("is pure: it does not mutate the given state", () => {
		const given = state({ progress: { play_3: 1 }, rankedStreak: 1 });
		const snapshot = structuredClone(given);
		evaluateMatch(facts(), given, [play3, weeklyStreak3]);
		expect(given).toEqual(snapshot);
	});
});
