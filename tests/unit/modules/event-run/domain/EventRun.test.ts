import { describe, expect, it } from "bun:test";

import { EventDefinition } from "../../../../../src/modules/event-run/domain/EventDefinition";
import {
	advanceRun,
	EventRun,
	isRunIdle,
	MAX_VOIDS,
	READY_RUN_IDLE_MS,
	startEventRun,
	tiersCrossed,
} from "../../../../../src/modules/event-run/domain/EventRun";

const now = new Date("2026-10-31T20:00:00Z");

function run(overrides: Partial<EventRun> = {}): EventRun {
	return {
		...startEventRun({ id: "run-1", userId: "user-1", eventId: "ev", deckId: "deck", now }),
		currentReservationId: "AbCdEfGh12345678",
		...overrides,
	};
}

const tiers = [
	{ wavesCleared: 3, essence: 150, cosmeticIds: [] },
	{ wavesCleared: 5, essence: 250, cosmeticIds: [] },
	{ wavesCleared: 8, essence: 400, cosmeticIds: [] },
];

describe("advanceRun", () => {
	it("a win moves to the next wave and always clears the applied reservation", () => {
		const next = advanceRun(run({ currentWave: 2, wavesCleared: 1 }), "win", 8, now);

		expect(next).toMatchObject({
			status: "ready",
			currentWave: 3,
			wavesCleared: 2,
			currentReservationId: null,
		});
	});

	it("a win moves the rival to the faced bots and leaves the next wave's rival undrawn", () => {
		const next = advanceRun(
			run({ currentWave: 2, wavesCleared: 1, currentBot: "Skeletons", facedBots: ["Haunted"] }),
			"win",
			8,
			now,
		);

		expect(next).toMatchObject({ currentBot: null, facedBots: ["Haunted", "Skeletons"] });
	});

	it("a void keeps the drawn rival for the retry", () => {
		for (const resolution of ["void", "stale_void", "player_void"] as const) {
			expect(advanceRun(run({ currentBot: "Horde" }), resolution, 8, now).currentBot).toBe("Horde");
		}
	});

	it("a win on the last wave wins the run", () => {
		const next = advanceRun(run({ currentWave: 8, wavesCleared: 7 }), "win", 8, now);

		expect(next).toMatchObject({ status: "won", currentWave: 8, wavesCleared: 8 });
	});

	it("a loss ends the run on the same wave", () => {
		expect(advanceRun(run({ currentWave: 4 }), "loss", 8, now)).toMatchObject({
			status: "lost",
			currentWave: 4,
		});
	});

	it("an infrastructure or stale void retries the same wave without counting a void", () => {
		for (const resolution of ["void", "stale_void"] as const) {
			expect(advanceRun(run({ currentWave: 4, voids: 2 }), resolution, 8, now)).toMatchObject({
				status: "ready",
				currentWave: 4,
				voids: 2,
			});
		}
	});

	it("a player void counts, and more than the allowance loses the run", () => {
		expect(advanceRun(run({ voids: MAX_VOIDS - 1 }), "player_void", 8, now)).toMatchObject({
			status: "ready",
			voids: MAX_VOIDS,
		});
		expect(advanceRun(run({ voids: MAX_VOIDS }), "player_void", 8, now)).toMatchObject({
			status: "lost",
			voids: MAX_VOIDS + 1,
		});
	});
});

describe("tiersCrossed", () => {
	it("returns only the tiers whose threshold this result crossed", () => {
		expect(tiersCrossed(tiers, 2, 3)).toEqual([tiers[0]]);
		expect(tiersCrossed(tiers, 3, 4)).toEqual([]);
		expect(tiersCrossed(tiers, 7, 8)).toEqual([tiers[2]]);
	});
});

describe("isRunIdle", () => {
	const event = { endsAt: new Date("2026-11-09T00:00:00Z") } as EventDefinition;

	it("a ready run idles after 24 hours without activity", () => {
		const updatedAt = new Date(now.getTime() - READY_RUN_IDLE_MS);
		expect(isRunIdle(run({ updatedAt }), event, now)).toBe(true);
		expect(isRunIdle(run({ updatedAt: new Date(now.getTime() - 1000) }), event, now)).toBe(false);
	});

	it("a ready run idles when the event closes", () => {
		const closed = { endsAt: now } as EventDefinition;
		expect(isRunIdle(run(), closed, now)).toBe(true);
	});

	it("a finished run never idles", () => {
		const updatedAt = new Date(0);
		expect(isRunIdle(run({ status: "lost", updatedAt }), event, now)).toBe(false);
	});
});
