import { describe, expect, it } from "bun:test";

import {
	computeStandings,
	StandingEntry,
} from "../../../../../src/modules/lightning/domain/computeStandings";

const at = (minute: number) => new Date(2026, 10, 10, 19, minute);

function entry(
	userId: string,
	overrides: Partial<Omit<StandingEntry, "userId">> = {},
): StandingEntry {
	return {
		userId,
		status: "active",
		registeredAt: at(0),
		score: 0,
		wins: 0,
		draws: 0,
		losses: 0,
		gamesPlayed: 0,
		...overrides,
	};
}

const game = (
	seat0UserId: string,
	seat1UserId: string,
	resolution: "seat0_win" | "seat1_win" | "draw" | "void" | "no_show",
) => ({
	seat0UserId,
	seat1UserId,
	resolution,
});

describe("computeStandings", () => {
	it("orders by score, then wins, then Buchholz, then registration time, and numbers positions", () => {
		const entries = [
			entry("a", { score: 6, wins: 2, gamesPlayed: 2, registeredAt: at(5) }),
			entry("b", { score: 6, wins: 2, gamesPlayed: 3, draws: 0, losses: 1, registeredAt: at(1) }),
			entry("c", { score: 4, wins: 1, draws: 1, gamesPlayed: 2 }),
			entry("d", { score: 4, wins: 0, draws: 4, gamesPlayed: 4 }),
			entry("e", { score: 0, losses: 2, gamesPlayed: 2 }),
		];
		// a beat c and e; b beat d and e and lost to c (Buchholz: a = 4, b = 8 + 0 = 8).
		const games = [
			game("a", "c", "seat0_win"),
			game("a", "e", "seat0_win"),
			game("b", "d", "seat0_win"),
			game("e", "b", "seat1_win"),
			game("c", "b", "seat0_win"),
			game("c", "e", "void"),
		];

		const standings = computeStandings(entries, games);

		expect(standings.map((s) => `${s.position}:${s.userId}:${s.tiebreak}`)).toEqual([
			"1:b:8",
			"2:a:4",
			"3:c:12",
			"4:d:6",
			"5:e:12",
		]);
		expect(standings[0]).toEqual({
			position: 1,
			userId: "b",
			score: 6,
			wins: 2,
			draws: 0,
			losses: 1,
			gamesPlayed: 3,
			tiebreak: 8,
		});
	});

	it("breaks a full tie by earliest registration", () => {
		const standings = computeStandings(
			[entry("late", { registeredAt: at(9) }), entry("early", { registeredAt: at(2) })],
			[],
		);

		expect(standings.map((s) => s.userId)).toEqual(["early", "late"]);
	});

	it("counts only played games (wins, losses, draws) in Buchholz and ignores removed opponents' absence", () => {
		const entries = [
			entry("a", { score: 3, wins: 1, gamesPlayed: 1 }),
			entry("b", { score: 3, wins: 1, gamesPlayed: 1 }),
		];
		const games = [
			game("a", "gone", "seat0_win"),
			game("b", "a", "no_show"),
			game("b", "x", "seat0_win"),
		];

		const [first, second] = computeStandings(entries, games, {
			opponentScores: new Map([["gone", 9]]),
		});

		expect(first).toMatchObject({ userId: "a", tiebreak: 9 });
		expect(second).toMatchObject({ userId: "b", tiebreak: 0 });
	});

	it("ranks every given entry, leaving the caller to pick who qualifies", () => {
		const standings = computeStandings([entry("a", { status: "withdrawn" }), entry("b")], []);

		expect(standings).toHaveLength(2);
	});

	it("orders Swiss by score, then Buchholz ahead of wins", () => {
		const entries = [
			entry("wins", { score: 4, wins: 1, draws: 1, gamesPlayed: 2 }),
			entry("strong", { score: 4, wins: 0, draws: 4, gamesPlayed: 4 }),
			entry("x", { score: 9 }),
		];
		const games = [game("strong", "x", "draw"), game("wins", "y", "seat0_win")];

		const arena = computeStandings(entries, games);
		const swiss = computeStandings(entries, games, { system: "swiss" });

		expect(arena.map((s) => s.userId)).toEqual(["x", "wins", "strong"]);
		expect(swiss.map((s) => s.userId)).toEqual(["x", "strong", "wins"]);
	});
});
