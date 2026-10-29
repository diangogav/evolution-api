import type { EventDefinition } from "../../../../../src/modules/event-run/domain/EventDefinition";
import type { EventRawStats } from "../../../../../src/modules/event-stats/domain/EventStatsReport";

export function eventDefinition(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return {
		id: "halloween-2026",
		name: { en: "Halloween Horde", es: "Halloween" },
		description: { en: "Survive" },
		format: "edison",
		startsAt: new Date("2026-10-28T00:00:00.000Z"),
		endsAt: new Date("2026-11-08T00:00:00.000Z"),
		attemptsPerDay: 3,
		waves: [{ tier: "easy", pool: ["a"] }],
		decks: [{ id: "necromancer", name: { en: "Necromancer" }, main: [], extra: [] }],
		prizeTiers: [],
		...overrides,
	};
}

export function emptyRawStats(): EventRawStats {
	return {
		statusCounts: [],
		totalPlayers: 0,
		daily: [],
		wavesCleared: [],
		decks: [],
		duelOutcomes: [],
		players: [],
	};
}
