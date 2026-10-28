import { describe, expect, it } from "bun:test";

import { StartEventRun } from "../../../../../src/modules/event-run/application/StartEventRun";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { decided, EVENT_ID, NOW, USER, World } from "./fakes";

function setup() {
	const world = new World();
	const useCase = new StartEventRun(
		world.catalog,
		world.runRepository,
		world.attemptRepository,
		world.store,
		world.applyDuel,
		world.transactions,
		world.nextRunId,
		world.pick,
	);
	const start = (overrides: { deckId?: string; eventId?: string; now?: Date } = {}) =>
		useCase.run({ userId: USER, eventId: EVENT_ID, deckId: "necromancer", now: NOW, ...overrides });
	return { world, start };
}

describe("StartEventRun", () => {
	it("starts a ready run at wave 1 facing the first wave's bot and spends one attempt of the UTC day", async () => {
		const { world, start } = setup();

		const run = await start();

		expect(run).toMatchObject({
			status: "ready",
			currentWave: 1,
			wavesCleared: 0,
			totalWaves: 8,
			botName: "Haunted",
			facedBots: [],
			deckId: "necromancer",
		});
		expect(world.attempts.get(`${USER}|${EVENT_ID}|2026-10-31`)).toBe(1);
		expect(world.events.slice(0, 2)).toEqual([`lock:${USER}:${EVENT_ID}`, "attempt:2026-10-31"]);
	});

	it("draws the first wave's rival from the easy pool at start and persists it", async () => {
		const { world, start } = setup();
		world.pickIndex = 2;

		const run = await start();

		expect(run.botName).toBe("Horde");
		expect(world.runs.get(run.id)).toMatchObject({ currentBot: "Horde", facedBots: [] });
	});

	it("refuses a fourth run on the same day with 422 and keeps the previous run untouched", async () => {
		const { world, start } = setup();
		await start();
		await start();
		const third = await start();

		await expect(start()).rejects.toThrow(UnprocessableError);
		expect(world.runs.get(third.id)?.status).toBe("ready");
		expect(world.attempts.get(`${USER}|${EVENT_ID}|2026-10-31`)).toBe(3);
	});

	it("the next UTC day has fresh attempts", async () => {
		const { start } = setup();
		await start();
		await start();
		await start();

		const tomorrow = await start({ now: new Date("2026-11-01T00:00:01Z") });

		expect(tomorrow.status).toBe("ready");
	});

	it("supersedes a ready run with no duel, revoking its unclaimed reservation", async () => {
		const { world, start } = setup();
		const old = world.seedRun({
			currentWave: 3,
			wavesCleared: 2,
			currentReservationId: "OLDRESERVATION01",
		});
		world.redis.set("OLDRESERVATION01", { claim: null } as never);

		const fresh = await start();

		expect(world.runs.get(old.id)?.status).toBe("superseded");
		expect(world.runs.get(old.id)?.currentReservationId).toBeNull();
		expect(world.redis.has("OLDRESERVATION01")).toBe(false);
		expect(fresh.currentWave).toBe(1);
	});

	it("applies the old run's finished duel before deciding: a run that just ended is not superseded", async () => {
		const { world, start } = setup();
		const old = world.seedRun({
			currentWave: 2,
			wavesCleared: 1,
			currentReservationId: "OLDRESERVATION01",
		});
		world.record("OLDRESERVATION01", decided(1));

		await start();

		expect(world.runs.get(old.id)?.status).toBe("lost");
		expect(world.applied.get("OLDRESERVATION01")?.outcome).toBe("loss");
	});

	it("applies a pending win and its tier prize, then supersedes the still-ready run", async () => {
		const { world, start } = setup();
		const old = world.seedRun({
			currentWave: 3,
			wavesCleared: 2,
			currentReservationId: "OLDRESERVATION01",
		});
		world.record("OLDRESERVATION01", decided(0));

		await start();

		const superseded = world.runs.get(old.id);
		expect(superseded).toMatchObject({ status: "superseded", wavesCleared: 3, currentWave: 4 });
		expect(world.ledger.map((e) => e.referenceKey)).toEqual([`event:${EVENT_ID}:tier:3`]);
		const applyAt = world.events.indexOf("applied:OLDRESERVATION01:win");
		const supersedeAt = world.events.indexOf(`update:${old.id}:superseded`);
		expect(applyAt).toBeGreaterThan(-1);
		expect(supersedeAt).toBeGreaterThan(applyAt);
	});

	it("refuses with 409 while the ready run's duel is live, and gives the attempt back", async () => {
		const { world, start } = setup();
		const old = world.seedRun({ currentReservationId: "LIVERESERVATION1" });
		world.record("LIVERESERVATION1", { startedAt: NOW });

		await expect(start()).rejects.toThrow(ConflictError);
		expect(world.runs.get(old.id)?.status).toBe("ready");
		expect(world.attempts.size).toBe(0);
	});

	it("refuses with 409 when the reservation was claimed but has no record yet", async () => {
		const { world, start } = setup();
		world.seedRun({ currentReservationId: "CLAIMEDRESERVAT1" });
		world.redis.set("CLAIMEDRESERVAT1", { claim: null, claimed: true } as never);

		await expect(start()).rejects.toThrow(ConflictError);
	});

	it("rejects an unknown event (404), a closed event and a deck outside the event (422)", async () => {
		const { start } = setup();

		await expect(start({ eventId: "nope" })).rejects.toThrow(NotFoundError);
		await expect(start({ now: new Date("2026-11-09T00:00:00Z") })).rejects.toThrow(
			UnprocessableError,
		);
		await expect(start({ now: new Date("2026-10-29T23:59:59Z") })).rejects.toThrow(
			UnprocessableError,
		);
		await expect(start({ deckId: "blue-eyes" })).rejects.toThrow(UnprocessableError);
	});
});
