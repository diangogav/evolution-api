import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { MatchesGetter } from "../../../../../src/modules/match/application/MatchesGetter";
import { Match } from "../../../../../src/modules/match/domain/Match";
import { UserMatchesSchema } from "../../../../../src/modules/match/infrastructure/MatchSchemas";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const match = (overrides: Partial<Parameters<typeof Match.from>[0]> = {}): Match =>
	Match.from({
		userId: "user-1",
		bestOf: 3,
		banListName: "Edison",
		playerNames: ["player1"],
		opponentNames: ["player2"],
		playerScore: 2,
		opponentScore: 1,
		points: 3,
		winner: true,
		date: new Date("2026-09-20T18:30:00.000Z"),
		season: 7,
		anulled: false,
		anulledReason: null,
		...overrides,
	});

const matchesOf = (matches: Match[]): Promise<unknown> =>
	new MatchesGetter({ get: async () => matches })
		.get({ userId: "user-1", limit: 100, page: 1, season: 7 })
		.then(wire);

describe("UserMatchesSchema", () => {
	it("accepts the bare array of matches MatchesGetter returns, dates as ISO strings", async () => {
		const matches = await matchesOf([
			match(),
			match({
				playerNames: ["player1", "partner"],
				opponentNames: ["player2", "player3"],
				winner: false,
				points: -2,
				anulled: true,
				anulledReason: "Cheating",
			}),
		]);

		expect(Value.Check(UserMatchesSchema, matches)).toBe(true);
		expect((matches as { date: unknown }[])[0].date).toBe("2026-09-20T18:30:00.000Z");
	});

	it("accepts an empty history and rejects a paginated wrapper", async () => {
		const matches = await matchesOf([]);

		expect(Value.Check(UserMatchesSchema, matches)).toBe(true);
		expect(Value.Check(UserMatchesSchema, { data: matches, total: 0, page: 1, limit: 100 })).toBe(
			false,
		);
	});
});
