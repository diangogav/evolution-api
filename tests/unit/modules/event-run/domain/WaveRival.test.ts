import { describe, expect, it } from "bun:test";

import { startEventRun } from "../../../../../src/modules/event-run/domain/EventRun";
import {
	assignRival,
	drawRival,
	randomPickIndex,
	WaveRivalError,
} from "../../../../../src/modules/event-run/domain/WaveRival";
import { halloween, HARD, NOW } from "../application/fakes";

const first = () => 0;
const last = (size: number) => size - 1;

describe("drawRival", () => {
	it("never draws the bot that pilots the player's own deck", () => {
		const drawn = new Set(
			[0, 1, 2].map((index) =>
				drawRival({ pool: HARD, ownDeckBot: "DarkWorld", faced: [], pick: () => index }),
			),
		);

		expect(drawn.has("DarkWorld")).toBe(false);
		expect([...drawn].sort()).toEqual(["CursedGarden", "Necromancer"]);
	});

	it("never draws a bot the run already faced", () => {
		const pool = ["Haunted", "Skeletons", "Horde"];

		expect(drawRival({ pool, ownDeckBot: null, faced: ["Haunted"], pick: first })).toBe(
			"Skeletons",
		);
		expect(drawRival({ pool, ownDeckBot: null, faced: ["Haunted"], pick: last })).toBe("Horde");
	});

	it("excludes the mirror and the faced bots together", () => {
		const drawn = drawRival({
			pool: HARD,
			ownDeckBot: "Necromancer",
			faced: ["DarkWorld"],
			pick: last,
		});

		expect(drawn).toBe("CursedGarden");
	});

	it("falls back to any pool member except the mirror when the faced rule empties the pool", () => {
		const drawn = drawRival({
			pool: HARD,
			ownDeckBot: "Necromancer",
			faced: ["DarkWorld", "CursedGarden"],
			pick: last,
		});

		expect(drawn).toBe("CursedGarden");
	});

	it("throws when the pool holds nothing but the mirror", () => {
		expect(() =>
			drawRival({ pool: ["Necromancer"], ownDeckBot: "Necromancer", faced: [], pick: first }),
		).toThrow(WaveRivalError);
	});

	it("draws an index inside the pool from crypto randomness", () => {
		for (let i = 0; i < 200; i++) {
			const index = randomPickIndex(3);
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(3);
			expect(Number.isInteger(index)).toBe(true);
		}
	});
});

describe("assignRival", () => {
	const fresh = () =>
		startEventRun({ id: "run-1", userId: "u", eventId: "ev", deckId: "necromancer", now: NOW });

	it("draws the current wave's rival for a ready run without one", () => {
		const run = assignRival({ ...fresh(), currentWave: 5 }, halloween(), first);

		expect(run.currentBot).toBe("DarkWorld");
	});

	it("keeps a rival already drawn and leaves ended runs alone", () => {
		const event = halloween();
		const drawn = { ...fresh(), currentBot: "Horde" };
		const lost = { ...fresh(), status: "lost" as const };

		expect(assignRival(drawn, event, first)).toBe(drawn);
		expect(assignRival(lost, event, first)).toBe(lost);
	});
});
