import { describe, expect, it } from "bun:test";

import type { EventDefinition } from "../../../../../src/modules/event-run/domain/EventDefinition";
import { GetEventStats } from "../../../../../src/modules/event-stats/application/GetEventStats";
import type { EventRawStats } from "../../../../../src/modules/event-stats/domain/EventStatsReport";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { emptyRawStats, eventDefinition } from "./fixtures";

const NOW = new Date("2026-10-29T12:00:00.000Z");

function build(events: EventDefinition[], raw: EventRawStats = emptyRawStats()) {
	const loaded: string[] = [];
	const getEventStats = new GetEventStats(
		{ findById: async (eventId) => events.find((event) => event.id === eventId) ?? null },
		{
			loadRawStats: async (eventId) => {
				loaded.push(eventId);
				return raw;
			},
		},
	);
	return { getEventStats, loaded };
}

describe("GetEventStats", () => {
	it("throws NotFoundError for an unknown event without querying its runs", async () => {
		const { getEventStats, loaded } = build([]);

		await expect(getEventStats.run({ eventId: "nope", now: NOW })).rejects.toThrow(NotFoundError);
		expect(loaded).toEqual([]);
	});

	it("builds the report for the event up to now", async () => {
		const raw: EventRawStats = {
			...emptyRawStats(),
			totalPlayers: 1,
			statusCounts: [{ status: "ready", runs: 1 }],
			daily: [{ date: "2026-10-29", runs: 1, players: 1 }],
		};
		const { getEventStats, loaded } = build([eventDefinition()], raw);

		const report = await getEventStats.run({ eventId: "halloween-2026", now: NOW });

		expect(loaded).toEqual(["halloween-2026"]);
		expect(report.event.name).toBe("Halloween");
		expect(report.totals.inProgressRuns).toBe(1);
		expect(report.daily).toEqual([
			{ date: "2026-10-28", runs: 0, players: 0 },
			{ date: "2026-10-29", runs: 1, players: 1 },
		]);
	});
});
