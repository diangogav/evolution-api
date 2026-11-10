import { describe, expect, it } from "bun:test";

import {
	pairSwissRound,
	SwissPlayer,
} from "../../../../../src/modules/lightning/domain/pairSwissRound";

const SEED = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";

const players = (...entries: Array<[string, number]>): SwissPlayer[] =>
	entries.map(([userId, score]) => ({ userId, score }));

const pairsOf = (result: ReturnType<typeof pairSwissRound>) =>
	result.pairs.map(({ seat0, seat1 }) => `${seat0}-${seat1}`);

function covers(result: ReturnType<typeof pairSwissRound>, ids: string[]): void {
	const seen = [...result.pairs.flatMap((p) => [p.seat0, p.seat1]), result.bye].filter(Boolean);
	expect([...seen].sort()).toEqual([...ids].sort());
}

describe("pairSwissRound — round one", () => {
	const field = players(["a", 0], ["b", 0], ["c", 0], ["d", 0], ["e", 0], ["f", 0], ["g", 0]);
	const ids = field.map((p) => p.userId);

	it("pairs a seeded shuffle, the same on every retry and whatever the input order", () => {
		const first = pairSwissRound({
			players: field,
			round: 1,
			seed: SEED,
			history: [],
			hadBye: new Set(),
		});
		const again = pairSwissRound({
			players: [...field].reverse(),
			round: 1,
			seed: SEED,
			history: [],
			hadBye: new Set(),
		});

		expect(again).toEqual(first);
		expect(first.pairs).toHaveLength(3);
		expect(first.bye).not.toBeNull();
		covers(first, ids);
	});

	it("draws differently for another tournament", () => {
		const draws = new Set(
			["t-1", "t-2", "t-3", "t-4"].map((seed) =>
				JSON.stringify(
					pairSwissRound({ players: field, round: 1, seed, history: [], hadBye: new Set() }),
				),
			),
		);

		expect(draws.size).toBeGreaterThan(1);
	});
});

describe("pairSwissRound — later rounds", () => {
	const later = (
		field: SwissPlayer[],
		history: Array<[string, string]> = [],
		hadBye: string[] = [],
	) => pairSwissRound({ players: field, round: 3, seed: SEED, history, hadBye: new Set(hadBye) });

	it("pairs inside score groups, better-placed player on seat 0", () => {
		const result = later(players(["a", 6], ["b", 6], ["c", 3], ["d", 3]));

		expect(pairsOf(result)).toEqual(["a-b", "c-d"]);
		expect(result.bye).toBeNull();
	});

	it("floats a leftover player down into the next group", () => {
		expect(pairsOf(later(players(["a", 6], ["b", 3], ["c", 3], ["d", 0])))).toEqual(["a-b", "c-d"]);
	});

	it("takes the best-placed partner not faced yet", () => {
		const result = later(players(["a", 6], ["b", 6], ["c", 3], ["d", 3]), [["b", "a"]]);

		expect(pairsOf(result)).toEqual(["a-c", "b-d"]);
	});

	it("backtracks when the greedy choice leaves a rematch further down", () => {
		const result = later(players(["a", 6], ["b", 6], ["c", 3], ["d", 3]), [
			["a", "b"],
			["b", "d"],
		]);

		expect(pairsOf(result)).toEqual(["a-d", "b-c"]);
	});

	it("accepts the rematch with the smallest score gap only when none can be avoided", () => {
		// a has faced everyone: one rematch is unavoidable, and a-c is the closest one.
		const result = later(players(["a", 9], ["c", 6], ["b", 3], ["d", 0]), [
			["a", "b"],
			["a", "c"],
			["a", "d"],
			["b", "c"],
		]);

		expect(pairsOf(result)).toEqual(["a-c", "b-d"]);
	});

	it("gives the bye to the lowest-placed player who has not had one", () => {
		const result = later(players(["a", 6], ["b", 3], ["c", 3], ["d", 0], ["e", 0]), [], ["e"]);

		expect(result.bye).toBe("d");
		expect(pairsOf(result)).toEqual(["a-b", "c-e"]);
	});

	it("gives the bye to the lowest-placed player when everyone already had one", () => {
		expect(later(players(["a", 6], ["b", 3], ["c", 0]), [], ["a", "b", "c"]).bye).toBe("c");
	});

	it("moves the bye up when the lowest player's bye would force a rematch", () => {
		const result = later(players(["a", 6], ["b", 3], ["c", 0]), [["a", "b"]]);

		expect(result.bye).toBe("b");
		expect(pairsOf(result)).toEqual(["a-c"]);
	});

	it("pairs a full field with a long history quickly and without rematches", () => {
		const ids = Array.from({ length: 64 }, (_, i) => `p${String(i).padStart(2, "0")}`);
		const history: Array<[string, string]> = [];
		// Five earlier rounds of a rotation: nobody faced the same player twice.
		for (let round = 1; round <= 5; round++) {
			for (let i = 0; i < 32; i++) history.push([ids[i], ids[32 + ((i + round) % 32)]]);
		}
		const field = ids.map((userId, i) => ({ userId, score: (i % 4) * 3 }));
		const startedAt = performance.now();

		const result = later(field, history);

		expect(performance.now() - startedAt).toBeLessThan(500);
		covers(result, ids);
		const played = new Set(history.map(([x, y]) => [x, y].sort().join("|")));
		for (const { seat0, seat1 } of result.pairs) {
			expect(played.has([seat0, seat1].sort().join("|"))).toBe(false);
		}
	});
});
