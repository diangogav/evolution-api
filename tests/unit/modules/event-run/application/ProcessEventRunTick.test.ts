import { describe, expect, it, mock } from "bun:test";

import { ProcessEventRunTick } from "../../../../../src/modules/event-run/application/ProcessEventRunTick";
import { READY_RUN_IDLE_MS } from "../../../../../src/modules/event-run/domain/EventRun";
import { STALE_DUEL_MS } from "../../../../../src/modules/event-run/domain/ReservedDuelRecord";
import { decided, NOW, OTHER_USER, World } from "./fakes";

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock((_error: string | Error) => undefined),
	};
}

function setup(applyDuel?: (world: World) => Pick<World["applyDuel"], "applyReservation">) {
	const world = new World();
	const log = logger();
	const tick = new ProcessEventRunTick(
		world.unitOfWork,
		world.duelRepository,
		world.runRepository,
		applyDuel ? applyDuel(world) : world.applyDuel,
		world.store,
		log,
		50,
	);
	return { world, tick, log };
}

describe("ProcessEventRunTick", () => {
	it("applies terminal records of its own reservations that nobody applied", async () => {
		const { world, tick } = setup();
		const run = world.seedRun({ currentReservationId: "RESERVATION00001" });
		world.record("RESERVATION00001", decided(0));

		const result = await tick.run(NOW);

		expect(result).toMatchObject({ applied: 1, stale: 0, skipped: false });
		expect(world.runs.get(run.id)).toMatchObject({ currentWave: 2, wavesCleared: 1 });
	});

	it("never reads reservations other features issued", async () => {
		const { world, tick } = setup();
		world.record("TOURNAMENTRSV001", decided(0));

		const result = await tick.run(NOW);

		expect(result.applied).toBe(0);
		expect(world.applied.has("TOURNAMENTRSV001")).toBe(false);
	});

	it("voids a row open for more than 2 hours without counting a void, once", async () => {
		const { world, tick } = setup();
		const joinedAt = new Date(NOW.getTime() - STALE_DUEL_MS - 1000);
		const run = world.seedRun({
			currentReservationId: "RESERVATION00001",
			updatedAt: joinedAt,
			voids: 1,
		});
		world.record("RESERVATION00001", { joinedAt, startedAt: joinedAt });

		expect(await tick.run(NOW)).toMatchObject({ stale: 1 });
		expect(world.runs.get(run.id)).toMatchObject({
			status: "ready",
			voids: 1,
			currentReservationId: null,
		});

		// A late terminal write for the voided reservation is never applied.
		world.record("RESERVATION00001", { joinedAt, ...decided(1) });
		expect(await tick.run(NOW)).toMatchObject({ applied: 0, stale: 0 });
		expect(world.runs.get(run.id)?.status).toBe("ready");
	});

	it("leaves live duels pending", async () => {
		const { world, tick } = setup();
		world.seedRun({ currentReservationId: "RESERVATION00001" });
		world.record("RESERVATION00001", { startedAt: NOW });

		expect(await tick.run(NOW)).toMatchObject({ applied: 0, stale: 0 });
	});

	it("expires idle ready runs", async () => {
		const { world, tick } = setup();
		const idle = world.seedRun({ updatedAt: new Date(NOW.getTime() - READY_RUN_IDLE_MS - 1) });

		expect((await tick.run(NOW)).expired).toBe(1);
		expect(world.runs.get(idle.id)?.status).toBe("expired");
	});

	it("skips the tick when another instance holds the lock", async () => {
		const { world, tick } = setup();
		world.lockHeld = true;
		world.seedRun({ currentReservationId: "RESERVATION00001" });
		world.record("RESERVATION00001", decided(0));

		expect(await tick.run(NOW)).toMatchObject({ applied: 0, skipped: true });
	});

	it("skips a reservation that fails to apply, rolls back its writes and applies the rest", async () => {
		const { world, tick, log } = setup((w) => ({
			applyReservation: async (reservationId, manager, now) => {
				if (reservationId !== "RESERVATION00001") {
					return w.applyDuel.applyReservation(reservationId, manager, now);
				}
				await w.duelRepository.markApplied(reservationId, "run", "win", manager);
				throw new Error("broken record");
			},
		}));
		world.seedRun({ currentReservationId: "RESERVATION00001" });
		world.record("RESERVATION00001", decided(0));
		const healthy = world.seedRun({ userId: OTHER_USER, currentReservationId: "RESERVATION00002" });
		world.record("RESERVATION00002", decided(0));

		const result = await tick.run(NOW);

		expect(result).toMatchObject({ applied: 1, failed: 1, skipped: false });
		expect(world.applied.has("RESERVATION00001")).toBe(false);
		expect(world.runs.get(healthy.id)).toMatchObject({ currentWave: 2, wavesCleared: 1 });
		expect(log.error).toHaveBeenCalledTimes(1);
		expect(String(log.error.mock.calls[0][0])).toContain("RESERVATION00001");
	});

	it("revokes the unclaimed reservation of a run it expires", async () => {
		const { world, tick } = setup();
		const idle = world.seedRun({
			currentReservationId: "RESERVATION00001",
			updatedAt: new Date(NOW.getTime() - READY_RUN_IDLE_MS - 1),
		});
		world.redis.set("RESERVATION00001", { reservationId: "RESERVATION00001" } as never);

		expect((await tick.run(NOW)).expired).toBe(1);
		expect(world.runs.get(idle.id)?.status).toBe("expired");
		expect(world.redis.has("RESERVATION00001")).toBe(false);
		expect(world.events).toContain("revoke:RESERVATION00001");
	});

	it("revokes reservations of runs expired at event close", async () => {
		const { world, tick } = setup();
		world.event = { ...world.event, endsAt: NOW };
		world.seedRun({ currentReservationId: "RESERVATION00001" });
		world.redis.set("RESERVATION00001", { reservationId: "RESERVATION00001" } as never);

		expect((await tick.run(NOW)).expired).toBe(1);
		expect(world.redis.has("RESERVATION00001")).toBe(false);
	});

	it("logs a failed or refused revoke after expiry without failing the tick", async () => {
		const { world, tick, log } = setup();
		const idleAt = new Date(NOW.getTime() - READY_RUN_IDLE_MS - 1);
		world.seedRun({ currentReservationId: "RESERVATION00001", updatedAt: idleAt });
		world.seedRun({
			userId: OTHER_USER,
			currentReservationId: "RESERVATION00002",
			updatedAt: idleAt,
		});
		world.redis.set("RESERVATION00001", {
			reservationId: "RESERVATION00001",
			claimed: true,
		} as never);
		const revoke = world.store.revoke;
		world.store.revoke = async (id) => {
			if (id === "RESERVATION00002") throw new Error("redis down");
			return revoke(id);
		};

		const result = await tick.run(NOW);

		expect(result).toMatchObject({ expired: 2, skipped: false });
		expect(log.error).toHaveBeenCalledTimes(2);
	});
});
