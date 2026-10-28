import { describe, expect, it } from "bun:test";

import { RequestEventDuel } from "../../../../../src/modules/event-run/application/RequestEventDuel";
import { READY_RUN_IDLE_MS } from "../../../../../src/modules/event-run/domain/EventRun";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { decided, NOW, OTHER_USER, USER, World } from "./fakes";

function setup() {
	const world = new World();
	const useCase = new RequestEventDuel(
		world.catalog,
		world.runRepository,
		world.duelRepository,
		world.store,
		world.applyDuel,
		world.transactions,
		world.nextReservationId,
	);
	const request = (runId: string, userId = USER, now = NOW) => useCase.run({ userId, runId, now });
	return { world, request };
}

describe("RequestEventDuel", () => {
	it("issues a reservation for the current wave and records it for the run", async () => {
		const { world, request } = setup();
		const run = world.seedRun({
			currentWave: 2,
			wavesCleared: 1,
			currentBot: "Skeletons",
			facedBots: ["Haunted"],
		});

		const result = await request(run.id);

		const reservationId = "RSV0000000000001";
		expect(result.duel).toEqual({
			reservationId,
			password: `rv#${reservationId}`,
			wave: 2,
			botName: "Skeletons",
			deck: { main: [1, 2], extra: [3], side: [] },
		});
		expect(result.run).toMatchObject({ status: "ready", currentWave: 2, botName: "Skeletons" });
		expect(world.redis.get(reservationId)?.participants[1]).toEqual({
			seat: 1,
			kind: "windbot",
			botName: "Skeletons",
		});
		expect(world.issuedReservations.get(reservationId)).toEqual({
			runId: run.id,
			wave: 2,
			botName: "Skeletons",
		});
		expect(world.runs.get(run.id)?.currentReservationId).toBe(reservationId);
	});

	it("applies a finished loss first and issues nothing: no free retry after a loss", async () => {
		const { world, request } = setup();
		const run = world.seedRun({
			currentWave: 4,
			wavesCleared: 3,
			currentReservationId: "LOSTRESERVATION1",
		});
		world.record("LOSTRESERVATION1", decided(1));

		const result = await request(run.id);

		expect(result.duel).toBeNull();
		expect(result.run.status).toBe("lost");
		expect(world.redis.size).toBe(0);
	});

	it("applies a finished win first and issues the next wave", async () => {
		const { world, request } = setup();
		const run = world.seedRun({
			currentWave: 1,
			currentBot: "Skeletons",
			currentReservationId: "WONRESERVATION01",
		});
		world.record("WONRESERVATION01", decided(0));

		const result = await request(run.id);

		expect(result.duel?.wave).toBe(2);
		expect(result.duel?.botName).toBe("Haunted");
		expect(result.run).toMatchObject({ wavesCleared: 1, facedBots: ["Skeletons"] });
		expect(world.redis.get(result.duel?.reservationId as string)?.participants[1]).toMatchObject({
			botName: "Haunted",
		});
	});

	it("issues the reservation against the drawn rival, never the wave's first pool entry", async () => {
		const { world, request } = setup();
		const run = world.seedRun({ currentWave: 5, wavesCleared: 4, currentBot: "CursedGarden" });

		const result = await request(run.id);

		expect(result.duel?.botName).toBe("CursedGarden");
		expect(world.redis.get(result.duel?.reservationId as string)?.participants[1]).toEqual({
			seat: 1,
			kind: "windbot",
			botName: "CursedGarden",
		});
	});

	it("retries a voided duel against the same rival", async () => {
		const { world, request } = setup();
		const run = world.seedRun({
			currentWave: 3,
			wavesCleared: 2,
			currentBot: "Witches",
			facedBots: ["Horde", "Skeletons"],
			currentReservationId: "VOIDRESERVATION1",
		});
		world.record("VOIDRESERVATION1", {
			endedAt: NOW,
			outcome: "abandoned",
			reason: "server_restart",
		});

		const result = await request(run.id);

		expect(world.applied.get("VOIDRESERVATION1")?.outcome).toBe("void");
		expect(result.duel).toMatchObject({ wave: 3, botName: "Witches" });
		expect(result.run.facedBots).toEqual(["Horde", "Skeletons"]);
	});

	it("draws a rival on request for a ready run stored without one", async () => {
		const { world, request } = setup();
		const run = world.seedRun({ currentWave: 2, wavesCleared: 1, facedBots: ["Haunted"] });

		const result = await request(run.id);

		expect(result.duel?.botName).toBe("Skeletons");
		expect(world.runs.get(run.id)?.currentBot).toBe("Skeletons");
	});

	it("revokes an unclaimed reservation and issues a new one", async () => {
		const { world, request } = setup();
		const run = world.seedRun();
		const first = await request(run.id);

		const second = await request(run.id);

		expect(second.duel?.reservationId).not.toBe(first.duel?.reservationId);
		expect(world.redis.has(first.duel?.reservationId as string)).toBe(false);
		expect(world.events).toContain(`revoke:${first.duel?.reservationId}`);
	});

	it("issues a new one when the old reservation is gone (expired unclaimed)", async () => {
		const { world, request } = setup();
		const run = world.seedRun({ currentReservationId: "EXPIREDRESERVAT1" });

		const result = await request(run.id);

		expect(result.duel?.reservationId).toBe("RSV0000000000001");
	});

	it("answers 409 when the reservation was claimed (in_use) and keeps it", async () => {
		const { world, request } = setup();
		const run = world.seedRun();
		const first = await request(run.id);
		world.claim(first.duel?.reservationId as string);

		await expect(request(run.id)).rejects.toThrow(ConflictError);
		expect(world.runs.get(run.id)?.currentReservationId).toBe(first.duel?.reservationId ?? "");
	});

	it("answers 409 while the duel record is live", async () => {
		const { world, request } = setup();
		const run = world.seedRun({ currentReservationId: "LIVERESERVATION1" });
		world.record("LIVERESERVATION1", { startedAt: NOW });

		await expect(request(run.id)).rejects.toThrow(ConflictError);
	});

	it("expires an idle ready run instead of issuing", async () => {
		const { world, request } = setup();
		const run = world.seedRun({ updatedAt: new Date(NOW.getTime() - READY_RUN_IDLE_MS) });

		const result = await request(run.id);

		expect(result).toMatchObject({ duel: null, run: { status: "expired" } });
	});

	it("returns a finished run's state without issuing", async () => {
		const { world, request } = setup();
		const run = world.seedRun({ status: "won", currentWave: 8, wavesCleared: 8 });

		expect(await request(run.id)).toMatchObject({ duel: null, run: { status: "won" } });
	});

	it("hides another player's run and malformed ids as 404", async () => {
		const { world, request } = setup();
		const run = world.seedRun();

		await expect(request(run.id, OTHER_USER)).rejects.toThrow(NotFoundError);
		await expect(request("not-a-uuid")).rejects.toThrow(NotFoundError);
	});
});
