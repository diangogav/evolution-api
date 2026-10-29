import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { EventStatsPostgresRepository } from "../../../../../src/modules/event-stats/infrastructure/EventStatsPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

// Answers each grouped query by the table and grouping it selects, so the test does
// not depend on the order the repository issues them in.
function answer(sql: string): unknown[] {
	const query = compact(sql);
	if (query.includes("FROM event_run_duels")) return [{ outcome: "win", duels: 39 }];
	if (query.includes("JOIN users")) {
		return [
			{
				user_id: "user-1",
				username: "Chazz_666",
				runs: 4,
				best_waves_cleared: 7,
				deck_ids: ["dark-world", "necromancer"],
				in_progress: false,
				last_activity_at: new Date("2026-10-29T14:40:36.567Z"),
			},
		];
	}
	if (query.includes("GROUP BY deck_id")) {
		return [
			{
				deck_id: "necromancer",
				runs: 10,
				players: 6,
				completed_runs: 0,
				best_waves_cleared: 7,
				total_waves_cleared: 24,
			},
		];
	}
	if (query.includes("GROUP BY waves_cleared")) return [{ waves_cleared: 2, runs: 10 }];
	if (query.includes("AS date")) return [{ date: "2026-10-29", runs: 19, players: 7 }];
	if (query.includes("GROUP BY status")) return [{ status: "lost", runs: 18 }];
	if (query.includes("COUNT(DISTINCT user_id)::int AS players")) return [{ players: 7 }];
	throw new Error(`unexpected query: ${query}`);
}

describe("EventStatsPostgresRepository", () => {
	afterEach(() => {
		mock.restore();
	});

	it("maps the grouped rows of one event's runs", async () => {
		const querySpy = spyOn(cosmeticsDataSource, "query").mockImplementation((async (sql: string) =>
			answer(sql)) as never);

		const raw = await new EventStatsPostgresRepository().loadRawStats("halloween-2026");

		expect(raw).toEqual({
			statusCounts: [{ status: "lost", runs: 18 }],
			totalPlayers: 7,
			daily: [{ date: "2026-10-29", runs: 19, players: 7 }],
			wavesCleared: [{ wavesCleared: 2, runs: 10 }],
			decks: [
				{
					deckId: "necromancer",
					runs: 10,
					players: 6,
					completedRuns: 0,
					bestWavesCleared: 7,
					totalWavesCleared: 24,
				},
			],
			duelOutcomes: [{ outcome: "win", duels: 39 }],
			players: [
				{
					userId: "user-1",
					username: "Chazz_666",
					runs: 4,
					bestWavesCleared: 7,
					deckIds: ["dark-world", "necromancer"],
					inProgress: false,
					lastActivityAt: new Date("2026-10-29T14:40:36.567Z"),
				},
			],
		});
		expect(querySpy.mock.calls.every(([, params]) => params?.[0] === "halloween-2026")).toBe(true);
	});

	it("buckets runs by their UTC creation day", async () => {
		const querySpy = spyOn(cosmeticsDataSource, "query").mockImplementation((async (sql: string) =>
			answer(sql)) as never);

		await new EventStatsPostgresRepository().loadRawStats("halloween-2026");

		const daily = querySpy.mock.calls
			.map(([sql]) => compact(sql))
			.find((sql) => sql.includes("AS date"));
		expect(daily).toContain("to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date");
	});
});
