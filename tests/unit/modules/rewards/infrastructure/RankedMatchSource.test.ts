import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import {
	RankedMatchSource,
	toUtcTimestamp,
} from "../../../../../src/modules/rewards/infrastructure/RankedMatchSource";

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
				createdAt: "2026-10-23 10:00:05.123456",
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
				createdAt: "2026-10-23 10:00:05.123456",
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
				createdAt: "2026-10-23 10:00:05.123456",
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
				createdAt: "2026-10-23 10:00:05.123456",
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
			{ lastCreatedAt: "2026-10-23 10:00:05.123456", lastId: "row-1" },
			50,
			new Date("2026-10-23T10:00:55Z"),
		);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("FROM matches");
		expect(sql).toContain("anulled = false");
		expect(sql).toContain("deleted_at IS NULL");
		expect(sql).toContain("ORDER BY m.created_at ASC, m.id ASC");
		expect(sql).toContain("$1::timestamp IS NULL");
		expect(sql).toContain("m.created_at <= $3::timestamp");
		expect(params).toEqual(["2026-10-23 10:00:05.123456", "row-1", "2026-10-23 10:00:55.000", 50]);
	});

	it("reads timestamp-without-zone columns as UTC instants and passes a null cursor on the first run", async () => {
		await new RankedMatchSource().fetchAfter(
			{ lastCreatedAt: null, lastId: null },
			10,
			new Date("2026-10-23T10:00:55Z"),
		);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain(`to_char(m.created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS "createdAt"`);
		expect(sql).toContain(`m.date AT TIME ZONE 'UTC' AS "date"`);
		expect(params[0]).toBeNull();
	});

	it("toUtcTimestamp formats the UTC wall clock regardless of the host zone", () => {
		expect(toUtcTimestamp(new Date("2026-10-25T23:59:59.250Z"))).toBe("2026-10-25 23:59:59.250");
	});
});
