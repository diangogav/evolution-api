import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { RankedMatchSource } from "../../../../../src/modules/rewards/infrastructure/RankedMatchSource";

describe("RankedMatchSource", () => {
	let querySpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		querySpy = spyOn(dataSource, "query").mockResolvedValue([]);
	});

	afterEach(() => {
		mock.restore();
	});

	it("maps match rows with their duels into facts, treating every ranked opponent id as registered", async () => {
		querySpy.mockResolvedValueOnce([
			{
				id: "row-1",
				createdAt: new Date("2026-10-23T10:00:05Z"),
				gameId: "game-1",
				userId: "user-1",
				winner: true,
				banListName: "2026.10 TCG",
				date: new Date("2026-10-23T10:00:00Z"),
				opponentIds: "user-2",
				duels: [
					{ result: "winner", turns: 7 },
					{ result: "loser", turns: 12 },
				],
			},
			{
				id: "row-2",
				createdAt: new Date("2026-10-23T10:00:05Z"),
				gameId: "game-1",
				userId: "user-2",
				winner: false,
				banListName: "2026.10 TCG",
				date: new Date("2026-10-23T10:00:00Z"),
				opponentIds: "",
				duels: null,
			},
		]);

		const rows = await new RankedMatchSource().fetchAfter(
			{ lastCreatedAt: null, lastId: null },
			100,
			new Date("2026-10-23T10:01:00Z"),
		);

		expect(rows).toEqual([
			{
				sourceId: "row-1",
				createdAt: new Date("2026-10-23T10:00:05Z"),
				gameId: "game-1",
				userId: "user-1",
				won: true,
				ranked: true,
				opponentRegistered: true,
				banListName: "2026.10 TCG",
				date: new Date("2026-10-23T10:00:00Z"),
				duels: [
					{ result: "winner", turns: 7 },
					{ result: "loser", turns: 12 },
				],
			},
			{
				sourceId: "row-2",
				createdAt: new Date("2026-10-23T10:00:05Z"),
				gameId: "game-1",
				userId: "user-2",
				won: false,
				ranked: true,
				opponentRegistered: false,
				banListName: "2026.10 TCG",
				date: new Date("2026-10-23T10:00:00Z"),
				duels: [],
			},
		]);
	});

	it("queries after the cursor in (created_at, id) order, skipping annulled and deleted rows, bounded by the lag", async () => {
		await new RankedMatchSource().fetchAfter(
			{ lastCreatedAt: new Date("2026-10-23T10:00:05Z"), lastId: "row-1" },
			50,
			new Date("2026-10-23T10:00:55Z"),
		);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("FROM matches");
		expect(sql).toContain("anulled = false");
		expect(sql).toContain("deleted_at IS NULL");
		expect(sql).toContain("ORDER BY m.created_at ASC, m.id ASC");
		expect(params).toEqual([
			new Date("2026-10-23T10:00:05Z"),
			"row-1",
			new Date("2026-10-23T10:00:55Z"),
			50,
		]);
	});
});
