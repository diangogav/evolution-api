import { describe, expect, it, mock } from "bun:test";

import { AdventCatalogPostgresRepository } from "../../../../../src/modules/advent-calendar/infrastructure/AdventCatalogPostgresRepository";
import { AdventDuelPostgresRepository } from "../../../../../src/modules/advent-calendar/infrastructure/AdventDuelPostgresRepository";
import { DoorProgressPostgresRepository } from "../../../../../src/modules/advent-calendar/infrastructure/DoorProgressPostgresRepository";
import type { ReservedDuelRecordReader } from "../../../../../src/modules/reserved-duel";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

const NOW = new Date("2026-12-05T12:00:00Z");

const doorRow = {
	user_id: "user-1",
	calendar_id: "advent-2026",
	day: "5",
	recovered_at: null,
	cleared_at: "2026-12-05T11:00:00Z",
	attempts: "2",
	die_roll: "4",
	current_reservation_id: null,
};

describe("AdventCatalogPostgresRepository", () => {
	it("maps a catalog row to a calendar", async () => {
		const manager = managerReturning([
			{
				id: "advent-2026",
				name: { en: "Advent Village" },
				description: { en: "Break the seals" },
				format: "goat",
				starts_at: "2026-12-01T00:00:00Z",
				ends_at: "2027-01-01T00:00:00Z",
				recovery_price: "50",
				doors: [{ day: 1, botName: "Sentinel1", prize: { essence: 50, cosmeticIds: [] } }],
				decks: [{ id: "chaos", name: { en: "Chaos" }, main: [1], extra: [] }],
				die: { essence: [10, 20, 30, 40, 60], rare: { essence: 100, cosmeticIds: [] } },
			},
		]);

		const calendar = await new AdventCatalogPostgresRepository().findById("advent-2026", manager);

		expect(calendar?.startsAt).toEqual(new Date("2026-12-01T00:00:00Z"));
		expect(calendar?.recoveryPrice).toBe(50);
		expect(calendar?.doors[0].botName).toBe("Sentinel1");
		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("FROM advent_calendar_catalog WHERE id = $1");
		expect(params).toEqual(["advent-2026"]);
	});

	it("is null for an unknown calendar", async () => {
		expect(
			await new AdventCatalogPostgresRepository().findById("x", managerReturning([])),
		).toBeNull();
	});
});

describe("DoorProgressPostgresRepository", () => {
	it("creates the door's row when missing, then reads it locked", async () => {
		const manager = managerReturning([], [doorRow]);

		const door = await new DoorProgressPostgresRepository().lockDoor(
			"user-1",
			"advent-2026",
			5,
			manager,
		);

		const [insert, insertParams] = manager.query.mock.calls[0];
		expect(compact(insert)).toContain(
			"INSERT INTO advent_doors (user_id, calendar_id, day) VALUES ($1, $2, $3) ON CONFLICT (user_id, calendar_id, day) DO NOTHING",
		);
		expect(insertParams).toEqual(["user-1", "advent-2026", 5]);
		const [select] = manager.query.mock.calls[1];
		expect(compact(select)).toEndWith(
			"WHERE user_id = $1 AND calendar_id = $2 AND day = $3 FOR UPDATE",
		);
		expect(door).toEqual({
			userId: "user-1",
			calendarId: "advent-2026",
			day: 5,
			recoveredAt: null,
			clearedAt: new Date("2026-12-05T11:00:00Z"),
			attempts: 2,
			dieRoll: 4,
			currentReservationId: null,
		});
	});

	it("lists one player's doors of one calendar without locking them", async () => {
		const manager = managerReturning([doorRow]);

		const doors = await new DoorProgressPostgresRepository().listForUser(
			"user-1",
			"advent-2026",
			manager,
		);

		expect(doors).toHaveLength(1);
		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toEndWith("WHERE user_id = $1 AND calendar_id = $2 ORDER BY day");
		expect(params).toEqual(["user-1", "advent-2026"]);
	});

	it("saves every mutable field of a door by its key", async () => {
		const manager = managerReturning([]);

		await new DoorProgressPostgresRepository().save(
			{
				userId: "user-1",
				calendarId: "advent-2026",
				day: 5,
				recoveredAt: null,
				clearedAt: NOW,
				attempts: 1,
				dieRoll: 6,
				currentReservationId: null,
			},
			NOW,
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe(
			"UPDATE advent_doors SET recovered_at = $4, cleared_at = $5, attempts = $6, die_roll = $7, current_reservation_id = $8, updated_at = $9 WHERE user_id = $1 AND calendar_id = $2 AND day = $3",
		);
		expect(params).toEqual(["user-1", "advent-2026", 5, null, NOW, 1, 6, null, NOW]);
	});
});

describe("AdventDuelPostgresRepository", () => {
	const noRecords: ReservedDuelRecordReader = { findRecords: async () => [] };

	it("records an issued reservation with its door and deck", async () => {
		const manager = managerReturning([]);

		await new AdventDuelPostgresRepository(noRecords).recordReservation(
			{
				reservationId: "RSV1",
				userId: "user-1",
				calendarId: "advent-2026",
				day: 5,
				deckId: "chaos",
				issuedAt: NOW,
			},
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"INSERT INTO advent_reservations (reservation_id, user_id, calendar_id, day, deck_id, issued_at)",
		);
		expect(params).toEqual(["RSV1", "user-1", "advent-2026", 5, "chaos", NOW]);
	});

	it("marks a record applied once: a second mark is skipped", async () => {
		const manager = managerReturning([{ reservation_id: "RSV1" }], []);
		const repository = new AdventDuelPostgresRepository(noRecords);

		expect(await repository.markApplied("RSV1", "win", manager)).toBe("inserted");
		expect(await repository.markApplied("RSV1", "win", manager)).toBe("skipped");
		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"ON CONFLICT (reservation_id) DO NOTHING RETURNING reservation_id",
		);
	});

	it("reads the duel server's record only by the reservation id asked for", async () => {
		const asked: string[][] = [];
		const reader: ReservedDuelRecordReader = {
			findRecords: async (ids) => {
				asked.push(ids);
				return [];
			},
		};

		expect(
			await new AdventDuelPostgresRepository(reader).findRecord("RSV1", managerReturning()),
		).toBeNull();
		expect(asked).toEqual([["RSV1"]]);
	});
});
