import { describe, expect, it } from "bun:test";

import {
	PairingCandidate,
	pairIdlePlayers,
} from "../../../../../src/modules/lightning/domain/pairIdlePlayers";

const t = (seconds: number) => new Date(2026, 10, 10, 20, 0, seconds);

function candidate(
	userId: string,
	score: number,
	idleSeconds = 0,
	lastOpponentId: string | null = null,
): PairingCandidate {
	return { userId, score, idleSince: t(idleSeconds), lastOpponentId };
}

const pairs = (result: ReturnType<typeof pairIdlePlayers>) =>
	result.map(({ seat0, seat1 }) => `${seat0}-${seat1}`);

describe("pairIdlePlayers", () => {
	it("pairs neighbours by score, the longest idle first among equals, and seats the better player at 0", () => {
		const result = pairIdlePlayers([
			candidate("d", 0, 10),
			candidate("a", 6, 30),
			candidate("c", 3, 5),
			candidate("b", 6, 40),
		]);

		expect(pairs(result)).toEqual(["a-b", "c-d"]);
	});

	it("leaves the odd player waiting for the next tick", () => {
		const result = pairIdlePlayers([candidate("a", 3), candidate("b", 3), candidate("c", 0)]);

		expect(pairs(result)).toEqual(["a-b"]);
	});

	it("pairs each player with the next one who is not their last opponent", () => {
		const result = pairIdlePlayers([
			candidate("a", 6, 0, "b"),
			candidate("b", 6, 1, "a"),
			candidate("c", 3),
			candidate("d", 3),
		]);

		expect(pairs(result)).toEqual(["a-c", "b-d"]);
	});

	it("skips rematches with either side's last opponent", () => {
		const result = pairIdlePlayers([
			candidate("a", 6, 0, null),
			candidate("b", 6, 1, "a"),
			candidate("c", 3),
		]);

		expect(pairs(result)).toEqual(["a-c"]);
	});

	it("looks as far down the list as it takes to avoid a rematch", () => {
		const result = pairIdlePlayers([
			candidate("a", 9, 0, "b"),
			candidate("b", 9, 1, "a"),
			candidate("c", 3, 0, "a"),
			candidate("d", 3, 1, "a"),
			candidate("e", 0, 0, "a"),
			candidate("f", 0, 1),
		]);

		expect(pairs(result)[0]).toBe("a-f");
	});

	it("leaves two players who just faced each other waiting for someone else", () => {
		expect(pairIdlePlayers([candidate("a", 3, 0, "b"), candidate("b", 0, 0, "a")])).toEqual([]);
	});

	it("pairs a rematch when the tournament allows it", () => {
		const result = pairIdlePlayers([candidate("a", 3, 0, "b"), candidate("b", 0, 0, "a")], {
			allowRematch: true,
		});

		expect(pairs(result)).toEqual(["a-b"]);
	});

	it("still prefers a new opponent when rematches are allowed", () => {
		const result = pairIdlePlayers(
			[candidate("a", 6, 0, "b"), candidate("b", 6, 1, "a"), candidate("c", 3)],
			{ allowRematch: true },
		);

		expect(pairs(result)).toEqual(["a-c"]);
	});

	it("treats a missing idle timestamp as waiting the longest and breaks full ties by user id", () => {
		const result = pairIdlePlayers([
			candidate("b", 3, 5),
			{ userId: "c", score: 3, idleSince: null, lastOpponentId: null },
			candidate("a", 3, 5),
			candidate("d", 3, 9),
		]);

		expect(pairs(result)).toEqual(["c-a", "b-d"]);
	});

	it("pairs nothing with fewer than two candidates", () => {
		expect(pairIdlePlayers([])).toEqual([]);
		expect(pairIdlePlayers([candidate("a", 0)])).toEqual([]);
	});
});
