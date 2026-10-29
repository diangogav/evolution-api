import { describe, expect, it } from "bun:test";

import type { EventDefinition } from "../../../../../src/modules/event-run/domain/EventDefinition";
import {
	buildEventStatsReport,
	type EventRawStats,
	eventDays,
	summarizeEvent,
	summarizeEvents,
} from "../../../../../src/modules/event-stats/domain/EventStatsReport";

function definition(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return {
		id: "halloween-2026",
		name: { en: "Halloween Horde", es: "Halloween" },
		description: { en: "Survive" },
		format: "edison",
		startsAt: new Date("2026-10-28T00:00:00.000Z"),
		endsAt: new Date("2026-11-08T00:00:00.000Z"),
		attemptsPerDay: 3,
		waves: [
			{ tier: "easy", pool: ["a"] },
			{ tier: "medium", pool: ["b"] },
			{ tier: "boss", pool: ["c"] },
		],
		decks: [
			{ id: "dark-world", name: { en: "Dark World" }, main: [], extra: [] },
			{ id: "necromancer", name: { en: "Necromancer", es: "Nigromante" }, main: [], extra: [] },
			{ id: "zombies", name: { en: "Zombies" }, main: [], extra: [] },
		],
		prizeTiers: [],
		...overrides,
	};
}

function raw(overrides: Partial<EventRawStats> = {}): EventRawStats {
	return {
		statusCounts: [],
		totalPlayers: 0,
		daily: [],
		wavesCleared: [],
		decks: [],
		duelOutcomes: [],
		players: [],
		...overrides,
	};
}

const NOW = new Date("2026-10-29T12:00:00.000Z");

describe("summarizeEvent", () => {
	it("localizes the name to Spanish and counts the waves", () => {
		expect(summarizeEvent(definition())).toEqual({
			id: "halloween-2026",
			name: "Halloween",
			startsAt: "2026-10-28T00:00:00.000Z",
			endsAt: "2026-11-08T00:00:00.000Z",
			waves: 3,
		});
	});

	it("falls back to English when the event has no Spanish name", () => {
		expect(summarizeEvent(definition({ name: { en: "Horde" } })).name).toBe("Horde");
	});
});

describe("summarizeEvents", () => {
	it("orders events newest start first", () => {
		const events = [
			definition({ id: "old", startsAt: new Date("2026-01-01T00:00:00Z") }),
			definition({ id: "new", startsAt: new Date("2026-12-01T00:00:00Z") }),
			definition({ id: "mid", startsAt: new Date("2026-06-01T00:00:00Z") }),
		];

		expect(summarizeEvents(events).map((event) => event.id)).toEqual(["new", "mid", "old"]);
	});
});

describe("eventDays", () => {
	it("lists UTC days from the start up to now while the event is open", () => {
		expect(
			eventDays(new Date("2026-10-28T00:00:00Z"), new Date("2026-11-08T00:00:00Z"), NOW),
		).toEqual(["2026-10-28", "2026-10-29"]);
	});

	it("stops before the end day once the event is over", () => {
		expect(
			eventDays(
				new Date("2026-10-28T00:00:00Z"),
				new Date("2026-10-31T00:00:00Z"),
				new Date("2026-12-01T00:00:00Z"),
			),
		).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
	});

	it("includes the day of a start or end that falls mid-day", () => {
		expect(
			eventDays(
				new Date("2026-10-28T18:00:00Z"),
				new Date("2026-10-30T06:00:00Z"),
				new Date("2026-12-01T00:00:00Z"),
			),
		).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
	});

	it("is empty before the event starts", () => {
		expect(
			eventDays(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-08T00:00:00Z"), NOW),
		).toEqual([]);
	});
});

describe("buildEventStatsReport", () => {
	it("totals runs per status and keeps the distinct player count", () => {
		const report = buildEventStatsReport(
			definition(),
			raw({
				totalPlayers: 7,
				statusCounts: [
					{ status: "lost", runs: 18 },
					{ status: "ready", runs: 1 },
					{ status: "won", runs: 2 },
					{ status: "expired", runs: 3 },
					{ status: "superseded", runs: 4 },
				],
			}),
			NOW,
		);

		expect(report.totals).toEqual({
			players: 7,
			runs: 28,
			completedRuns: 2,
			inProgressRuns: 1,
			lostRuns: 18,
			expiredRuns: 3,
			supersededRuns: 4,
		});
	});

	it("zero-fills the daily series and drops days outside the window", () => {
		const report = buildEventStatsReport(
			definition(),
			raw({
				daily: [
					{ date: "2026-10-29", runs: 19, players: 7 },
					{ date: "2026-10-27", runs: 5, players: 5 },
				],
			}),
			NOW,
		);

		expect(report.daily).toEqual([
			{ date: "2026-10-28", runs: 0, players: 0 },
			{ date: "2026-10-29", runs: 19, players: 7 },
		]);
	});

	it("counts for every wave the runs that cleared at least that many waves", () => {
		const report = buildEventStatsReport(
			definition(),
			raw({
				wavesCleared: [
					{ wavesCleared: 0, runs: 8 },
					{ wavesCleared: 1, runs: 1 },
					{ wavesCleared: 3, runs: 2 },
				],
			}),
			NOW,
		);

		expect(report.waveFunnel).toEqual([
			{ wave: 1, runsCleared: 3 },
			{ wave: 2, runsCleared: 2 },
			{ wave: 3, runsCleared: 2 },
		]);
	});

	it("lists every deck of the event, unplayed ones included, busiest first", () => {
		const report = buildEventStatsReport(
			definition(),
			raw({
				decks: [
					{
						deckId: "dark-world",
						runs: 3,
						players: 2,
						completedRuns: 1,
						bestWavesCleared: 3,
						totalWavesCleared: 5,
					},
					{
						deckId: "necromancer",
						runs: 10,
						players: 6,
						completedRuns: 0,
						bestWavesCleared: 2,
						totalWavesCleared: 24,
					},
				],
			}),
			NOW,
		);

		expect(report.decks).toEqual([
			{
				deckId: "necromancer",
				deckName: "Nigromante",
				runs: 10,
				players: 6,
				completedRuns: 0,
				bestWavesCleared: 2,
				avgWavesCleared: 2.4,
			},
			{
				deckId: "dark-world",
				deckName: "Dark World",
				runs: 3,
				players: 2,
				completedRuns: 1,
				bestWavesCleared: 3,
				avgWavesCleared: 1.7,
			},
			{
				deckId: "zombies",
				deckName: "Zombies",
				runs: 0,
				players: 0,
				completedRuns: 0,
				bestWavesCleared: 0,
				avgWavesCleared: 0,
			},
		]);
	});

	it("maps duel outcomes to wins, losses and player voids, the rest to other", () => {
		const report = buildEventStatsReport(
			definition(),
			raw({
				duelOutcomes: [
					{ outcome: "win", duels: 39 },
					{ outcome: "loss", duels: 18 },
					{ outcome: "player_void", duels: 5 },
					{ outcome: "void", duels: 2 },
					{ outcome: "stale_void", duels: 1 },
					{ outcome: "not_current", duels: 3 },
				],
			}),
			NOW,
		);

		expect(report.duels).toEqual({ wins: 39, losses: 18, playerVoids: 5, other: 6 });
	});

	it("orders players by best wave, then runs, and renders their last activity", () => {
		const player = (userId: string, bestWavesCleared: number, runs: number) => ({
			userId,
			username: userId,
			runs,
			bestWavesCleared,
			deckIds: ["dark-world"],
			inProgress: userId === "b",
			lastActivityAt: new Date("2026-10-29T14:40:36.567Z"),
		});

		const report = buildEventStatsReport(
			definition(),
			raw({ players: [player("a", 2, 1), player("b", 3, 1), player("c", 2, 4)] }),
			NOW,
		);

		expect(report.players.map((entry) => entry.userId)).toEqual(["b", "c", "a"]);
		expect(report.players[0]).toEqual({
			userId: "b",
			username: "b",
			runs: 1,
			bestWavesCleared: 3,
			deckIds: ["dark-world"],
			inProgress: true,
			lastActivityAt: "2026-10-29T14:40:36.567Z",
		});
	});

	it("reports an event without runs as zeros", () => {
		const report = buildEventStatsReport(definition(), raw(), NOW);

		expect(report.totals.runs).toBe(0);
		expect(report.waveFunnel.every((wave) => wave.runsCleared === 0)).toBe(true);
		expect(report.duels).toEqual({ wins: 0, losses: 0, playerVoids: 0, other: 0 });
		expect(report.players).toEqual([]);
		expect(report.event.id).toBe("halloween-2026");
	});
});
