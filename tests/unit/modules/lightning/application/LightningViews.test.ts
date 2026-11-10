import { describe, expect, it } from "bun:test";

import { toTournamentView } from "../../../../../src/modules/lightning/application/LightningViews";
import { STARTS_AT, World } from "./fakes";

const minutes = (n: number) => new Date(STARTS_AT.getTime() + n * 60_000);

describe("toTournamentView", () => {
	it("gives an arena no rounds and no round clocks", () => {
		const view = toTournamentView(new World().seedRunning());

		expect(view).toMatchObject({
			system: "arena",
			rounds: null,
			currentRound: 0,
			roundEndsAt: null,
			nextRoundAt: null,
		});
	});

	it("gives a live Swiss round its deadline, and a break the next pairing time", () => {
		const world = new World();
		const live = world.seedSwiss([], { currentRound: 1, roundStartedAt: minutes(0) });

		expect(toTournamentView(live)).toMatchObject({
			system: "swiss",
			rounds: 3,
			currentRound: 1,
			roundEndsAt: minutes(40).toISOString(),
			nextRoundAt: null,
		});
		expect(toTournamentView({ ...live, roundClosedAt: minutes(31) })).toMatchObject({
			roundEndsAt: null,
			nextRoundAt: minutes(32).toISOString(),
		});
	});
});
