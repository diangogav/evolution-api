import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { EventAttemptPostgresRepository } from "../../../../../src/modules/event-run/infrastructure/EventAttemptPostgresRepository";
import { EventCatalogPostgresRepository } from "../../../../../src/modules/event-run/infrastructure/EventCatalogPostgresRepository";
import { EventDuelPostgresRepository } from "../../../../../src/modules/event-run/infrastructure/EventDuelPostgresRepository";
import { EventRunPostgresRepository } from "../../../../../src/modules/event-run/infrastructure/EventRunPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

describe("EventAttemptPostgresRepository", () => {
	it("spends an attempt with one conditional upsert so concurrent starts cannot pass the cap", async () => {
		const manager = managerReturning([{ count: 3 }], []);
		const repository = new EventAttemptPostgresRepository();

		expect(await repository.consume("user-1", "ev", "2026-10-31", 3, manager)).toBe(true);
		expect(await repository.consume("user-1", "ev", "2026-10-31", 3, manager)).toBe(false);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"ON CONFLICT (user_id, event_id, period_key) DO UPDATE SET count = event_run_attempts.count + 1 WHERE event_run_attempts.count < $4 RETURNING count",
		);
		expect(params).toEqual(["user-1", "ev", "2026-10-31", 3]);
	});
});

describe("EventRunPostgresRepository", () => {
	const row = {
		id: "run-1",
		user_id: "user-1",
		event_id: "ev",
		deck_id: "necromancer",
		status: "ready",
		current_wave: 2,
		waves_cleared: 1,
		current_bot: "Skeletons",
		faced_bots: ["Horde"],
		current_reservation_id: "RESERVATION00001",
		voids: 0,
		created_at: new Date("2026-10-31T19:00:00Z"),
		updated_at: new Date("2026-10-31T19:30:00Z"),
	};

	it("locks the run row and maps it", async () => {
		const manager = managerReturning([row]);

		const run = await new EventRunPostgresRepository().findByIdForUpdate("run-1", manager);

		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"FROM event_runs WHERE id = $1 FOR UPDATE",
		);
		expect(run).toEqual({
			id: "run-1",
			userId: "user-1",
			eventId: "ev",
			deckId: "necromancer",
			status: "ready",
			currentWave: 2,
			wavesCleared: 1,
			currentBot: "Skeletons",
			facedBots: ["Horde"],
			currentReservationId: "RESERVATION00001",
			voids: 0,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		});
	});

	it("persists the drawn rival and the faced bots as a JSON array", async () => {
		const manager = managerReturning([]);
		const repository = new EventRunPostgresRepository();
		const run = {
			id: "run-1",
			userId: "user-1",
			eventId: "ev",
			deckId: "necromancer",
			status: "ready" as const,
			currentWave: 3,
			wavesCleared: 2,
			currentBot: "Witches",
			facedBots: ["Horde", "Haunted"],
			currentReservationId: null,
			voids: 0,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};

		await repository.insert(run, manager);
		await repository.update(run, manager);

		const [insertSql, insertParams] = manager.query.mock.calls[0];
		expect(compact(insertSql)).toContain("current_bot, faced_bots");
		expect(insertParams).toContain("Witches");
		expect(insertParams).toContain(JSON.stringify(["Horde", "Haunted"]));
		const [updateSql, updateParams] = manager.query.mock.calls[1];
		expect(compact(updateSql)).toContain("current_bot = $8, faced_bots = $9::jsonb");
		expect(updateParams?.slice(7)).toEqual(["Witches", JSON.stringify(["Horde", "Haunted"])]);
	});

	it("serializes starts of one player in one event with a transaction-scoped lock", async () => {
		const manager = managerReturning([]);

		await new EventRunPostgresRepository().lockUserEvent("user-1", "ev", manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(sql).toContain("pg_advisory_xact_lock");
		expect(params).toEqual(["user-1", "ev"]);
	});

	it("expires idle ready runs only when their reservation has no duel record, returning the dropped reservations", async () => {
		const manager = managerReturning([
			[
				{ id: "run-1", reservation_id: "RESERVATION00001" },
				{ id: "run-2", reservation_id: null },
			],
			2,
		]);
		const now = new Date("2026-10-31T20:00:00Z");
		const idleBefore = new Date("2026-10-30T20:00:00Z");

		expect(await new EventRunPostgresRepository().expireIdle(now, idleBefore, manager)).toEqual([
			{ runId: "run-1", reservationId: "RESERVATION00001" },
			{ runId: "run-2", reservationId: null },
		]);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("r.status = 'ready'");
		expect(compact(sql)).toContain("(r.updated_at < $2 OR c.ends_at <= $1)");
		expect(compact(sql)).toContain("NOT EXISTS ( SELECT 1 FROM reserved_duels");
		expect(compact(sql)).toContain("FOR UPDATE OF r");
		expect(compact(sql)).toContain("RETURNING e.id, idle.current_reservation_id AS reservation_id");
		expect(params).toEqual([now, idleBefore]);
	});
});

describe("EventDuelPostgresRepository", () => {
	it("records each issued reservation with the bot it was issued against", async () => {
		const manager = managerReturning([]);
		const issuedAt = new Date("2026-10-31T19:00:00Z");

		await new EventDuelPostgresRepository().recordReservation(
			"R",
			"run-1",
			5,
			"DarkWorld",
			issuedAt,
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("(reservation_id, run_id, wave, bot_name, issued_at)");
		expect(params).toEqual(["R", "run-1", 5, "DarkWorld", issuedAt]);
	});

	it("gates each record with the event_run_duels primary key", async () => {
		const manager = managerReturning([{ reservation_id: "R" }], []);
		const repository = new EventDuelPostgresRepository();

		expect(await repository.markApplied("R", "run-1", "win", manager)).toBe("inserted");
		expect(await repository.markApplied("R", "run-1", "win", manager)).toBe("skipped");
		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"ON CONFLICT (reservation_id) DO NOTHING RETURNING reservation_id",
		);
	});

	it("lists pending records starting from its own reservations, anti-joined with applied ones", async () => {
		const manager = managerReturning([{ reservation_id: "A" }, { reservation_id: "B" }]);
		const staleBefore = new Date("2026-10-31T18:00:00Z");

		expect(await new EventDuelPostgresRepository().listPending(staleBefore, 50, manager)).toEqual([
			"A",
			"B",
		]);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("FROM event_run_reservations AS r JOIN reserved_duels AS d");
		expect(compact(sql)).toContain("NOT EXISTS (SELECT 1 FROM event_run_duels");
		expect(compact(sql)).toContain(
			"d.ended_at IS NOT NULL OR COALESCE(d.joined_at, d.started_at) < $1",
		);
		expect(params).toEqual([staleBefore, 50]);
	});

	it("reads the server's record read-only and maps it", async () => {
		const ended = new Date("2026-10-31T19:40:00Z");
		const manager = managerReturning([
			{
				reservation_id: "R",
				joined_at: ended,
				started_at: ended,
				ended_at: ended,
				outcome: "decided",
				winner_seat: "0",
				abandoned_by_seat: null,
				reason: "win",
			},
		]);

		const record = await new EventDuelPostgresRepository().findRecord("R", manager);

		expect(manager.query.mock.calls[0][0]).toStartWith("SELECT");
		expect(record).toMatchObject({
			outcome: "decided",
			winnerSeat: 0,
			abandonedBySeat: null,
			endedAt: ended,
		});
	});
});

describe("EventCatalogPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		querySpy = spyOn(cosmeticsDataSource, "query").mockResolvedValue([]);
	});

	afterEach(() => {
		mock.restore();
	});

	it("maps a catalog row and returns null for an unknown event", async () => {
		querySpy.mockResolvedValueOnce([
			{
				id: "ev",
				name: { en: "Horde" },
				description: { en: "Survive" },
				format: "edison",
				starts_at: new Date("2026-10-30T00:00:00Z"),
				ends_at: new Date("2026-11-09T00:00:00Z"),
				attempts_per_day: 3,
				waves: [{ tier: "easy", pool: ["Haunted", "Skeletons"] }],
				decks: [],
				prize_tiers: [],
			},
		]);
		const repository = new EventCatalogPostgresRepository();

		expect(await repository.findById("ev")).toMatchObject({
			id: "ev",
			attemptsPerDay: 3,
			waves: [{ tier: "easy", pool: ["Haunted", "Skeletons"] }],
		});
		expect(await repository.findById("nope")).toBeNull();
	});

	it("lists every catalog event, newest start first", async () => {
		const row = (id: string, startsAt: string) => ({
			id,
			name: { en: id },
			description: { en: "Survive" },
			format: "edison",
			starts_at: new Date(startsAt),
			ends_at: new Date("2026-12-01T00:00:00Z"),
			attempts_per_day: "3",
			waves: [],
			decks: [],
			prize_tiers: [],
		});
		querySpy.mockResolvedValueOnce([
			row("new", "2026-11-01T00:00:00Z"),
			row("old", "2026-01-01T00:00:00Z"),
		]);
		const repository = new EventCatalogPostgresRepository();

		const events = await repository.list();

		expect(events.map((event) => event.id)).toEqual(["new", "old"]);
		expect(events[1]).toMatchObject({
			startsAt: new Date("2026-01-01T00:00:00Z"),
			attemptsPerDay: 3,
		});
		const [sql, params] = querySpy.mock.calls[0];
		expect(compact(sql)).toContain("FROM event_catalog ORDER BY starts_at DESC");
		expect(params).toEqual([]);
	});
});
