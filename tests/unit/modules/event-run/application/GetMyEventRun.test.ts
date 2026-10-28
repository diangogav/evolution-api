import { describe, expect, it } from "bun:test";

import { GetMyEventRun } from "../../../../../src/modules/event-run/application/GetMyEventRun";
import { READY_RUN_IDLE_MS } from "../../../../../src/modules/event-run/domain/EventRun";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { decided, EVENT_ID, NOW, USER, World } from "./fakes";

function setup() {
	const world = new World();
	const useCase = new GetMyEventRun(
		world.catalog,
		world.runRepository,
		world.store,
		world.applyDuel,
		world.transactions,
	);
	const get = (now = NOW, eventId = EVENT_ID) => useCase.run({ userId: USER, eventId, now });
	return { world, get };
}

describe("GetMyEventRun", () => {
	it("returns null without runs and 404 for an unknown event", async () => {
		const { get } = setup();

		expect(await get()).toEqual({ run: null });
		await expect(get(NOW, "nope")).rejects.toThrow(NotFoundError);
	});

	it("applies the pending record on the spot", async () => {
		const { world, get } = setup();
		world.seedRun({ currentReservationId: "RESERVATION00001", currentBot: "Haunted" });
		world.record("RESERVATION00001", decided(0));

		const { run } = await get();

		expect(run).toMatchObject({
			status: "ready",
			currentWave: 2,
			wavesCleared: 1,
			botName: "Skeletons",
			facedBots: ["Haunted"],
		});
		expect(world.applied.has("RESERVATION00001")).toBe(true);
	});

	it("draws the rival lazily for a ready run stored without one, keeping its idle clock", async () => {
		const { world, get } = setup();
		const updatedAt = new Date(NOW.getTime() - 60_000);
		const stored = world.seedRun({ currentWave: 3, wavesCleared: 2, updatedAt });
		world.pickIndex = 1;

		const { run } = await get();

		expect(run).toMatchObject({ botName: "Vampires", facedBots: [] });
		expect(world.runs.get(stored.id)).toMatchObject({ currentBot: "Vampires", updatedAt });
	});

	it("returns no rival once the run ended, with the bots it faced", async () => {
		const { world, get } = setup();
		world.seedRun({
			status: "lost",
			currentWave: 3,
			wavesCleared: 2,
			currentBot: "Witches",
			facedBots: ["Horde", "Haunted"],
		});

		const { run } = await get();

		expect(run).toMatchObject({ botName: null, facedBots: ["Horde", "Haunted"] });
	});

	it("reports a live duel without changing the run", async () => {
		const { world, get } = setup();
		world.seedRun({ currentReservationId: "RESERVATION00001" });
		world.record("RESERVATION00001", { startedAt: NOW });

		const { run } = await get();

		expect(run).toMatchObject({ status: "ready", duelLive: true });
	});

	it("expires a ready run idle for 24 hours, and one whose event closed", async () => {
		const { world, get } = setup();
		const idle = world.seedRun({ updatedAt: new Date(NOW.getTime() - READY_RUN_IDLE_MS) });

		expect((await get()).run?.status).toBe("expired");
		expect(world.runs.get(idle.id)?.status).toBe("expired");

		const second = setup();
		second.world.seedRun();
		expect((await second.get(second.world.event.endsAt)).run?.status).toBe("expired");
	});

	it("does not expire an idle run whose duel is still live", async () => {
		const { world, get } = setup();
		world.seedRun({
			currentReservationId: "RESERVATION00001",
			updatedAt: new Date(NOW.getTime() - READY_RUN_IDLE_MS),
		});
		world.record("RESERVATION00001", { startedAt: NOW, joinedAt: NOW });

		expect((await get()).run?.status).toBe("ready");
	});

	it("returns the latest run once it ended", async () => {
		const { world, get } = setup();
		world.seedRun({ status: "lost", currentWave: 5, wavesCleared: 4 });

		expect((await get()).run).toMatchObject({ status: "lost", wavesCleared: 4, botName: null });
	});
});
