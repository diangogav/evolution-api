import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { UnrankedMatchSource } from "../../../../../src/modules/rewards/infrastructure/UnrankedMatchSource";

const row = {
	id: "um-1",
	createdAt: "2026-10-23 10:00:05.123456",
	gameId: "game-1",
	banListName: "2026.10 TCG",
	date: new Date("2026-10-23T10:00:00Z"),
	playerIds: "user-a",
	opponentIds: "user-b",
	winnerTeam: 0,
	duels: [
		{ winnerTeam: 0, turns: 7 },
		{ winnerTeam: 0, turns: 12 },
	],
};

describe("UnrankedMatchSource", () => {
	let querySpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		querySpy = spyOn(dataSource, "query").mockResolvedValue([]);
	});

	afterEach(() => {
		mock.restore();
	});

	it("emits one unranked fact per registered user on either side, with the result seen from that side", async () => {
		querySpy.mockResolvedValueOnce([row]);

		const facts = await new UnrankedMatchSource().fetchAfter(
			{ lastCreatedAt: null, lastId: null },
			100,
			new Date("2026-10-23T10:01:00Z"),
		);

		expect(facts).toEqual([
			{
				sourceId: "um-1",
				createdAt: "2026-10-23 10:00:05.123456",
				gameId: "game-1",
				userId: "user-a",
				won: true,
				ranked: false,
				opponentRegistered: true,
				banListName: "2026.10 TCG",
				date: new Date("2026-10-23T10:00:00Z"),
				duels: [
					{ result: "winner", turns: 7 },
					{ result: "winner", turns: 12 },
				],
			},
			{
				sourceId: "um-1",
				createdAt: "2026-10-23 10:00:05.123456",
				gameId: "game-1",
				userId: "user-b",
				won: false,
				ranked: false,
				opponentRegistered: true,
				banListName: "2026.10 TCG",
				date: new Date("2026-10-23T10:00:00Z"),
				duels: [
					{ result: "loser", turns: 7 },
					{ result: "loser", turns: 12 },
				],
			},
		]);
	});

	it("marks the opponent side unregistered when it holds no ids, and emits nothing for a guest-only match", async () => {
		querySpy.mockResolvedValueOnce([
			{ ...row, opponentIds: "" },
			{ ...row, id: "um-2", playerIds: null, opponentIds: null },
		]);

		const facts = await new UnrankedMatchSource().fetchAfter(
			{ lastCreatedAt: null, lastId: null },
			100,
			new Date("2026-10-23T10:01:00Z"),
		);

		expect(facts).toEqual([
			expect.objectContaining({
				sourceId: "um-1",
				userId: "user-a",
				won: true,
				opponentRegistered: false,
			}),
		]);
	});

	it("drains unranked_matches in (created_at, id) order after the cursor, within the lag bound, with its duels", async () => {
		await new UnrankedMatchSource().fetchAfter(
			{ lastCreatedAt: "2026-10-23 10:00:05.123456", lastId: "um-1" },
			50,
			new Date("2026-10-23T10:01:00Z"),
		);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("FROM unranked_matches um");
		expect(sql).toContain("to_char(um.created_at, 'YYYY-MM-DD HH24:MI:SS.US')");
		expect(sql).toContain("um.date AT TIME ZONE 'UTC'");
		expect(sql).toContain("FROM unranked_duels d WHERE d.match_id = um.id");
		expect(sql).toContain("(um.created_at, um.id) > ($1::timestamp, $2::varchar)");
		expect(sql).toContain("um.created_at <= $3::timestamp");
		expect(sql).toContain("ORDER BY um.created_at ASC, um.id ASC");
		expect(params).toEqual(["2026-10-23 10:00:05.123456", "um-1", "2026-10-23 10:01:00.000", 50]);
	});
});
