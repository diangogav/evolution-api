import { describe, expect, it } from "bun:test";

import { lightningTournament } from "../../../../../src/modules/lightning/domain/LightningTournament";
import {
	estimatedSwissEnd,
	startSwissTournament,
	swissNextRoundAt,
	swissRoundCount,
	swissRoundEndsAt,
} from "../../../../../src/modules/lightning/domain/swissRounds";

const NOW = new Date("2026-11-10T18:00:00Z");
const STARTS_AT = new Date("2026-11-10T20:00:00Z");

function swiss(overrides: Partial<Parameters<typeof lightningTournament>[0]> = {}) {
	return lightningTournament({
		id: "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b",
		name: "Swiss Friday",
		format: "tcg",
		season: 7,
		registrationOpensAt: new Date("2026-11-10T19:00:00Z"),
		startsAt: STARTS_AT,
		system: "swiss",
		createdBy: "admin-1",
		now: NOW,
		...overrides,
	});
}

describe("swissRoundCount", () => {
	it("plays ceil(log2(players)) rounds, never fewer than three", () => {
		expect([2, 4, 5, 8, 9, 16, 17, 32, 64].map(swissRoundCount)).toEqual([
			3, 3, 3, 3, 4, 4, 5, 5, 6,
		]);
	});
});

describe("estimatedSwissEnd", () => {
	it("adds every round with its break to the start", () => {
		expect(
			estimatedSwissEnd({
				startsAt: STARTS_AT,
				rounds: 4,
				roundMinutes: 40,
				roundBreakSeconds: 60,
			}),
		).toEqual(new Date("2026-11-10T22:44:00Z"));
	});
});

describe("startSwissTournament", () => {
	it("fixes the computed round count from the field at start and re-estimates the end", () => {
		const started = startSwissTournament(swiss(), 9);

		expect(started.rounds).toBe(4);
		expect(started.endsAt).toEqual(new Date("2026-11-10T22:44:00Z"));
	});

	it("keeps a round count given at creation", () => {
		const started = startSwissTournament(swiss({ rounds: 5 }), 4);

		expect(started.rounds).toBe(5);
		expect(started.endsAt).toEqual(new Date("2026-11-10T23:25:00Z"));
	});
});

describe("round clocks", () => {
	const live = {
		...swiss({ rounds: 3 }),
		status: "running" as const,
		currentRound: 2,
		roundStartedAt: new Date("2026-11-10T20:42:00Z"),
		roundClosedAt: null,
	};

	it("gives the deadline of a live round and no next round", () => {
		expect(swissRoundEndsAt(live)).toEqual(new Date("2026-11-10T21:22:00Z"));
		expect(swissNextRoundAt(live)).toBeNull();
	});

	it("gives the next pairing time during a break and no deadline", () => {
		const closed = { ...live, roundClosedAt: new Date("2026-11-10T21:05:00Z") };

		expect(swissRoundEndsAt(closed)).toBeNull();
		expect(swissNextRoundAt(closed)).toEqual(new Date("2026-11-10T21:06:00Z"));
	});

	it("has no next round after the last one, nor any clock before round one or for an arena", () => {
		const last = { ...live, currentRound: 3, roundClosedAt: new Date("2026-11-10T21:05:00Z") };
		const before = { ...live, currentRound: 0, roundStartedAt: null };
		const arena = { ...live, system: "arena" as const };

		expect(swissNextRoundAt(last)).toBeNull();
		expect(swissRoundEndsAt(before)).toBeNull();
		expect(swissNextRoundAt(before)).toBeNull();
		expect(swissRoundEndsAt(arena)).toBeNull();
	});

	it("shows no clock once the tournament stopped running", () => {
		expect(swissRoundEndsAt({ ...live, status: "completed" })).toBeNull();
	});
});
