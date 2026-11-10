import { describe, expect, it } from "bun:test";

import {
	DEFAULT_ESSENCE_BY_POSITION,
	DEFAULT_LOBBY_TIMEOUT_SECONDS,
	DEFAULT_MAX_PLAYERS,
	DEFAULT_MIN_PLAYERS,
	DEFAULT_POINTS_BY_POSITION,
	DEFAULT_TURN_TIME_SECONDS,
	InvalidLightningTournamentError,
	lightningTournament,
	prizeForPosition,
} from "../../../../../src/modules/lightning/domain/LightningTournament";

const NOW = new Date("2026-11-10T18:00:00Z");

const input = {
	id: "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b",
	name: " Friday Lightning ",
	format: "tcg" as const,
	season: 7,
	registrationOpensAt: new Date("2026-11-10T19:00:00Z"),
	startsAt: new Date("2026-11-10T20:00:00Z"),
	endsAt: new Date("2026-11-10T21:00:00Z"),
	createdBy: "admin-1",
	now: NOW,
};

describe("lightningTournament", () => {
	it("stores the defaults on the row so later default changes never rewrite history", () => {
		const tournament = lightningTournament(input);

		expect(tournament).toMatchObject({
			id: input.id,
			name: "Friday Lightning",
			format: "tcg",
			status: "scheduled",
			season: 7,
			turnTimeSeconds: DEFAULT_TURN_TIME_SECONDS,
			lobbyTimeoutSeconds: DEFAULT_LOBBY_TIMEOUT_SECONDS,
			minPlayers: DEFAULT_MIN_PLAYERS,
			maxPlayers: DEFAULT_MAX_PLAYERS,
			pointsByPosition: DEFAULT_POINTS_BY_POSITION,
			essenceByPosition: DEFAULT_ESSENCE_BY_POSITION,
			createdBy: "admin-1",
			cancelledReason: null,
			createdAt: NOW,
			updatedAt: NOW,
		});
		expect(tournament.pointsByPosition).not.toBe(DEFAULT_POINTS_BY_POSITION);
	});

	it("opens registration at once when the window already started", () => {
		const open = lightningTournament({ ...input, registrationOpensAt: NOW });

		expect(open.status).toBe("registration");
	});

	it("accepts explicit settings and point tables", () => {
		const tournament = lightningTournament({
			...input,
			turnTimeSeconds: 120,
			lobbyTimeoutSeconds: 60,
			minPlayers: 2,
			maxPlayers: 8,
			pointsByPosition: { positions: [5, 3], others: 0 },
			essenceByPosition: { positions: [100], others: 10 },
		});

		expect(tournament).toMatchObject({
			turnTimeSeconds: 120,
			lobbyTimeoutSeconds: 60,
			minPlayers: 2,
			maxPlayers: 8,
			pointsByPosition: { positions: [5, 3], others: 0 },
			essenceByPosition: { positions: [100], others: 10 },
		});
	});

	it("rejects an invalid name, format, window, turn time, player bounds or prize table", () => {
		const cases: Array<Partial<Parameters<typeof lightningTournament>[0]>> = [
			{ name: "   " },
			{ name: "x".repeat(81) },
			{ format: "goat" as never },
			{ registrationOpensAt: new Date("2026-11-10T20:00:01Z") },
			{ endsAt: input.startsAt },
			{ startsAt: NOW },
			{ turnTimeSeconds: 59 },
			{ turnTimeSeconds: 999 },
			{ turnTimeSeconds: 90.5 },
			{ lobbyTimeoutSeconds: 0 },
			{ minPlayers: 1 },
			{ minPlayers: 10, maxPlayers: 9 },
			{ pointsByPosition: { positions: [10, -1], others: 1 } },
			{ essenceByPosition: { positions: [1.5], others: 0 } },
			{ season: 0 },
		];

		for (const override of cases) {
			expect(() => lightningTournament({ ...input, ...override })).toThrow(
				InvalidLightningTournamentError,
			);
		}
	});
});

describe("prizeForPosition", () => {
	it("pays the listed positions and the rest with the shared amount", () => {
		const table = { positions: [10, 7, 5, 3], others: 1 };

		expect(prizeForPosition(table, 1)).toBe(10);
		expect(prizeForPosition(table, 4)).toBe(3);
		expect(prizeForPosition(table, 5)).toBe(1);
		expect(prizeForPosition(table, 40)).toBe(1);
	});
});
