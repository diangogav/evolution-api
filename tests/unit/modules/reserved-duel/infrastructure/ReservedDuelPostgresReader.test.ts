import { describe, expect, it, mock } from "bun:test";

import { ReservedDuelPostgresReader } from "../../../../../src/modules/reserved-duel/infrastructure/ReservedDuelPostgresReader";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

describe("ReservedDuelPostgresReader", () => {
	it("reads the server's rows read-only, by reservation id list, and maps them", async () => {
		const ended = new Date("2026-10-31T19:40:00Z");
		const manager = managerReturning([
			{
				reservation_id: "R1",
				joined_at: ended,
				started_at: ended,
				ended_at: ended,
				outcome: "decided",
				winner_seat: "0",
				abandoned_by_seat: null,
				reason: "win",
			},
			{
				reservation_id: "R2",
				joined_at: null,
				started_at: null,
				ended_at: null,
				outcome: null,
				winner_seat: null,
				abandoned_by_seat: "1",
				reason: null,
			},
		]);

		const records = await new ReservedDuelPostgresReader().findRecords(["R1", "R2"], manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(sql).toStartWith("SELECT");
		expect(compact(sql)).toContain("FROM reserved_duels WHERE reservation_id = ANY($1)");
		expect(params).toEqual([["R1", "R2"]]);
		expect(records).toEqual([
			{
				reservationId: "R1",
				joinedAt: ended,
				startedAt: ended,
				endedAt: ended,
				outcome: "decided",
				winnerSeat: 0,
				abandonedBySeat: null,
				reason: "win",
			},
			{
				reservationId: "R2",
				joinedAt: null,
				startedAt: null,
				endedAt: null,
				outcome: null,
				winnerSeat: null,
				abandonedBySeat: 1,
				reason: null,
			},
		]);
	});

	it("answers an empty list without touching the database", async () => {
		const manager = managerReturning();

		expect(await new ReservedDuelPostgresReader().findRecords([], manager)).toEqual([]);
		expect(manager.query).not.toHaveBeenCalled();
	});
});
