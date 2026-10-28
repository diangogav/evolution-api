import { describe, expect, it } from "bun:test";

import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { decided, EVENT_ID, NOW, USER, World } from "./fakes";

const RSV = "RESERVATION00001";

async function applyWith(world: World, overrides: Parameters<World["seedRun"]>[0]) {
	const run = world.seedRun({ currentReservationId: RSV, ...overrides });
	return world.applyDuel.applyCurrent(run, world.event, world.manager, NOW);
}

describe("ApplyReservedDuel", () => {
	it("maps each record row of the design table to the run transition", async () => {
		const cases = [
			{ record: decided(0), status: "ready", wave: 3, voids: 0 },
			{ record: decided(1), status: "lost", wave: 2, voids: 0 },
			{ record: { endedAt: NOW, outcome: "draw" as const }, status: "lost", wave: 2, voids: 0 },
			{
				record: {
					startedAt: NOW,
					endedAt: NOW,
					outcome: "abandoned" as const,
					abandonedBySeat: 0,
					reason: "disconnect",
				},
				status: "lost",
				wave: 2,
				voids: 0,
			},
			{
				record: {
					endedAt: NOW,
					outcome: "abandoned" as const,
					abandonedBySeat: 0,
					reason: "no_show",
				},
				status: "ready",
				wave: 2,
				voids: 1,
			},
			{
				record: {
					startedAt: NOW,
					endedAt: NOW,
					outcome: "abandoned" as const,
					reason: "server_restart",
				},
				status: "ready",
				wave: 2,
				voids: 0,
			},
			{
				record: { endedAt: NOW, outcome: "abandoned" as const, reason: "bot_unavailable" },
				status: "ready",
				wave: 2,
				voids: 0,
			},
		];

		for (const { record, status, wave, voids } of cases) {
			const world = new World();
			world.record(RSV, record);

			const { run } = await applyWith(world, { currentWave: 2, wavesCleared: 1 });

			expect({ status: run.status, wave: run.currentWave, voids: run.voids }).toEqual({
				status,
				wave,
				voids,
			} as never);
			expect(run.currentReservationId).toBeNull();
			expect(world.runs.get(run.id)).toMatchObject({ status, currentReservationId: null });
		}
	});

	it("draws the next wave's rival after a win, excluding the bots already faced", async () => {
		const world = new World();
		world.record(RSV, decided(0));

		const { run } = await applyWith(world, {
			currentWave: 2,
			wavesCleared: 1,
			currentBot: "Haunted",
			facedBots: ["Skeletons"],
		});

		expect(run).toMatchObject({
			currentWave: 3,
			currentBot: "Archfiends",
			facedBots: ["Skeletons", "Haunted"],
		});
		expect(world.runs.get(run.id)).toMatchObject({ currentBot: "Archfiends" });
	});

	it("never draws the player's own deck as a hard-tier rival", async () => {
		const world = new World();
		world.pickIndex = 2;
		world.seedRun({
			currentWave: 4,
			wavesCleared: 3,
			currentBot: "Vampires",
			facedBots: ["Haunted", "Skeletons", "Archfiends"],
			currentReservationId: RSV,
		});
		world.record(RSV, decided(0));
		const stored = [...world.runs.values()][0];

		const { run } = await world.applyDuel.applyCurrent(stored, world.event, world.manager, NOW);

		expect(run.currentWave).toBe(5);
		expect(run.currentBot).toBe("CursedGarden");
	});

	it("clears the rival when the last wave is won", async () => {
		const world = new World();
		world.seedRun({
			currentWave: 8,
			wavesCleared: 7,
			currentBot: "Gravekeepers",
			currentReservationId: RSV,
		});
		world.record(RSV, decided(0));
		const stored = [...world.runs.values()][0];

		const { run } = await world.applyDuel.applyCurrent(stored, world.event, world.manager, NOW);

		expect(run).toMatchObject({ status: "won", currentBot: null });
		expect(run.facedBots[run.facedBots.length - 1]).toBe("Gravekeepers");
	});

	it("a fourth player void loses the run", async () => {
		const world = new World();
		world.record(RSV, {
			endedAt: NOW,
			outcome: "abandoned",
			abandonedBySeat: 0,
			reason: "no_show",
		});

		const { run } = await applyWith(world, { voids: 3 });

		expect(run).toMatchObject({ status: "lost", voids: 4 });
	});

	it("applies a record once: a second apply (worker after /me) changes nothing", async () => {
		const world = new World();
		world.record(RSV, decided(0));
		const { run } = await applyWith(world, { currentWave: 3, wavesCleared: 2 });

		const second = await world.applyDuel.applyReservation(RSV, world.manager, NOW);

		expect(second).toBe("ignored");
		expect(world.runs.get(run.id)).toMatchObject({ currentWave: 4, wavesCleared: 3 });
		expect(world.ledger).toHaveLength(1);
	});

	it("never advances twice when the gate already holds the record, even if the run still points at it", async () => {
		const world = new World();
		world.record(RSV, decided(0));
		world.applied.set(RSV, { runId: "earlier", outcome: "win" });

		const { run, resolution } = await applyWith(world, { currentWave: 3, wavesCleared: 2 });

		expect(resolution).toBeNull();
		expect(run).toMatchObject({ currentWave: 3, wavesCleared: 2, currentReservationId: null });
		expect(world.ledger).toHaveLength(0);
	});

	it("leaves a live duel alone and reports it as live", async () => {
		const world = new World();
		world.record(RSV, { startedAt: NOW });

		const result = await applyWith(world, {});

		expect(result).toMatchObject({ resolution: null, duelLive: true });
		expect(result.run.currentReservationId).toBe(RSV);
		expect(world.applied.size).toBe(0);
	});

	it("pays essence and the tier cosmetics when the third wave is cleared", async () => {
		const world = new World();
		world.record(RSV, decided(0));

		const { prizes } = await applyWith(world, { currentWave: 3, wavesCleared: 2 });

		expect(prizes.map((tier) => tier.wavesCleared)).toEqual([3]);
		expect(world.ledger).toEqual([
			{ userId: USER, kind: "event_run", referenceKey: `event:${EVENT_ID}:tier:3`, delta: 150 },
		]);
		expect(world.granted).toEqual([
			{ userId: USER, cosmeticId: "sleeve-3", source: EntitlementSource.CAMPAIGN },
		]);
	});

	it("pays each tier once per player across runs (best mark)", async () => {
		const world = new World();
		world.record(RSV, decided(0));
		await applyWith(world, { currentWave: 3, wavesCleared: 2 });

		world.record("RESERVATION00002", decided(0));
		const secondRun = world.seedRun({
			currentWave: 3,
			wavesCleared: 2,
			currentReservationId: "RESERVATION00002",
		});
		world.runs.set(secondRun.id, secondRun);
		await world.applyDuel.applyCurrent(secondRun, world.event, world.manager, NOW);

		expect(world.ledger).toHaveLength(1);
		expect(world.granted).toHaveLength(1);
	});

	it("grants every cosmetic of a tier once, even when a later run crosses it again", async () => {
		const world = new World();
		world.event.prizeTiers = [
			{ wavesCleared: 5, essence: 250, cosmeticIds: ["avatar-5", "sleeve-5"] },
		];
		world.activeCosmetics = new Set(["avatar-5", "sleeve-5"]);
		world.record(RSV, decided(0));
		await applyWith(world, { currentWave: 5, wavesCleared: 4 });

		world.record("RESERVATION00002", decided(0));
		const secondRun = world.seedRun({
			currentWave: 5,
			wavesCleared: 4,
			currentReservationId: "RESERVATION00002",
		});
		await world.applyDuel.applyCurrent(secondRun, world.event, world.manager, NOW);

		expect(world.granted).toEqual([
			{ userId: USER, cosmeticId: "avatar-5", source: EntitlementSource.CAMPAIGN },
			{ userId: USER, cosmeticId: "sleeve-5", source: EntitlementSource.CAMPAIGN },
		]);
	});

	it("wins the run on wave 8 and pays the last tier", async () => {
		const world = new World();
		world.record(RSV, decided(0));

		const { run, prizes } = await applyWith(world, { currentWave: 8, wavesCleared: 7 });

		expect(run.status).toBe("won");
		expect(prizes.map((tier) => tier.essence)).toEqual([400]);
	});

	it("skips a cosmetic missing from the catalog without blocking progress", async () => {
		const world = new World();
		world.activeCosmetics.clear();
		world.record(RSV, decided(0));

		const { run } = await applyWith(world, { currentWave: 3, wavesCleared: 2 });

		expect(run.wavesCleared).toBe(3);
		expect(world.ledger).toHaveLength(1);
		expect(world.granted).toHaveLength(0);
	});

	it("records but ignores a result whose reservation is no longer the run's current one", async () => {
		const world = new World();
		const run = world.seedRun({ currentReservationId: "NEWRESERVATION01" });
		world.issuedReservations.set("OLDRESERVATION01", { runId: run.id, wave: 1 });
		world.record("OLDRESERVATION01", decided(1));

		const outcome = await world.applyDuel.applyReservation("OLDRESERVATION01", world.manager, NOW);

		expect(outcome).toBe("ignored");
		expect(world.applied.get("OLDRESERVATION01")?.outcome).toBe("not_current");
		expect(world.runs.get(run.id)).toMatchObject({
			status: "ready",
			currentReservationId: "NEWRESERVATION01",
		});
	});
});
