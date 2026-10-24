import { describe, expect, it } from "bun:test";

import { ProcessRewardsTick } from "../../../../../src/modules/rewards/application/ProcessRewardsTick";
import { QueryableManager } from "../../../../../src/modules/rewards/domain/EssenceLedgerRepository";
import {
	MatchSource,
	SourceCursor,
	SourcedMatchFacts,
} from "../../../../../src/modules/rewards/domain/MatchSource";
import { Mission } from "../../../../../src/modules/rewards/domain/Mission";
import { MissionCatalogRepository } from "../../../../../src/modules/rewards/domain/MissionCatalogRepository";
import {
	ProgressRow,
	RewardsProjectionRepository,
	UserRewardState,
} from "../../../../../src/modules/rewards/domain/RewardsProjectionRepository";
import { RewardsUnitOfWork } from "../../../../../src/modules/rewards/domain/RewardsUnitOfWork";
import { toUtcTimestamp } from "../../../../../src/modules/rewards/infrastructure/RankedMatchSource";

function mission(
	code: string,
	rule: Mission["rule"],
	period: Mission["period"] = "daily",
): Mission {
	return {
		id: `id-${code}`,
		code,
		name: { en: code },
		description: { en: code },
		period,
		rule,
		reward: { type: "essence", amount: 20 },
		active: true,
		sortOrder: 0,
	};
}

const catalog: Mission[] = [
	mission("play_3", { metric: "duelsPlayed", target: 3 }),
	mission("win_1", { metric: "duelsWon", target: 1 }),
	mission("ranked_play_1", { metric: "rankedDuelsPlayed", target: 1 }),
	mission("win_other_format", { metric: "winDifferentFormat", target: 1 }),
	mission("win_fast", { metric: "winUnder10Turns", target: 1 }),
	mission("weekly_play_20", { metric: "duelsPlayed", target: 20 }, "weekly"),
	mission("weekly_ranked_streak_3", { metric: "rankedWinStreak", target: 3 }, "weekly"),
];

function facts(overrides: Partial<SourcedMatchFacts> = {}): SourcedMatchFacts {
	return {
		sourceId: "row-1",
		createdAt: "2026-10-23 10:00:05.000456",
		gameId: "game-1",
		userId: "user-1",
		won: true,
		ranked: true,
		opponentRegistered: true,
		banListName: "2026.10 TCG",
		date: new Date("2026-10-23T10:00:00Z"),
		duels: [{ result: "winner", turns: 7 }],
		...overrides,
	};
}

class FakeSource implements MatchSource {
	readonly name = "matches";
	readonly calls: Array<{ cursor: SourceCursor; limit: number; notAfter: Date }> = [];
	constructor(private readonly rows: SourcedMatchFacts[]) {}

	async fetchAfter(
		cursor: SourceCursor,
		limit: number,
		notAfter: Date,
	): Promise<SourcedMatchFacts[]> {
		this.calls.push({ cursor, limit, notAfter });
		return this.rows
			.filter((row) => row.createdAt <= toUtcTimestamp(notAfter))
			.filter((row) =>
				cursor.lastCreatedAt === null
					? true
					: row.createdAt > cursor.lastCreatedAt ||
						(row.createdAt === cursor.lastCreatedAt && row.sourceId > (cursor.lastId ?? "")),
			)
			.slice(0, limit);
	}
}

class FakeProjection implements RewardsProjectionRepository {
	cursors = new Map<string, SourceCursor>();
	progress = new Map<string, ProgressRow>();
	states = new Map<string, UserRewardState>();

	async readCursor(source: string): Promise<SourceCursor> {
		return this.cursors.get(source) ?? { lastCreatedAt: null, lastId: null };
	}
	async advanceCursor(source: string, cursor: SourceCursor): Promise<void> {
		this.cursors.set(source, cursor);
	}
	async loadProgress(
		userId: string,
		pairs: Array<{ missionId: string; periodKey: string }>,
	): Promise<ProgressRow[]> {
		return pairs
			.map((pair) => this.progress.get(`${userId}|${pair.missionId}|${pair.periodKey}`))
			.filter((row): row is ProgressRow => row !== undefined);
	}
	async saveProgress(userId: string, rows: ProgressRow[]): Promise<void> {
		for (const row of rows) this.progress.set(`${userId}|${row.missionId}|${row.periodKey}`, row);
	}
	async loadUserState(userId: string): Promise<UserRewardState> {
		return this.states.get(userId) ?? { lastFormat: null, rankedStreak: 0 };
	}
	async saveUserState(userId: string, state: UserRewardState): Promise<void> {
		this.states.set(userId, state);
	}
}

class FakeUnitOfWork implements RewardsUnitOfWork {
	runs = 0;
	constructor(private readonly lockAvailable = true) {}
	async run<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T | undefined> {
		this.runs++;
		if (!this.lockAvailable) return undefined;
		return work({ query: async () => [] });
	}
}

const catalogRepository: MissionCatalogRepository = { findActive: async () => catalog };

function tick(source: FakeSource, projection: FakeProjection, uow = new FakeUnitOfWork()) {
	return new ProcessRewardsTick([source], projection, catalogRepository, uow, {
		batchSize: 100,
		lagMs: 5000,
	});
}

describe("ProcessRewardsTick", () => {
	it("projects progress for the day's missions and the weekly ones, saves user state and advances the cursor", async () => {
		const source = new FakeSource([facts()]);
		const projection = new FakeProjection();

		const result = await tick(source, projection).run(new Date("2026-10-23T10:01:00Z"));

		expect(result).toEqual({ locked: true, processed: { matches: 1 } });
		expect(projection.cursors.get("matches")).toEqual({
			lastCreatedAt: "2026-10-23 10:00:05.000456",
			lastId: "row-1",
		});
		expect(projection.states.get("user-1")).toEqual({ lastFormat: "2026.10 TCG", rankedStreak: 1 });

		const weekly = projection.progress.get("user-1|id-weekly_play_20|2026-W43");
		expect(weekly).toEqual({
			missionId: "id-weekly_play_20",
			periodKey: "2026-W43",
			value: 1,
			completed: false,
		});
		const dailyRows = [...projection.progress.values()].filter(
			(row) => row.periodKey === "2026-10-23",
		);
		expect(dailyRows).toHaveLength(3);
	});

	it("is idempotent: a second tick with nothing new changes nothing", async () => {
		const source = new FakeSource([facts()]);
		const projection = new FakeProjection();
		const useCase = tick(source, projection);

		await useCase.run(new Date("2026-10-23T10:01:00Z"));
		const snapshot = structuredClone([...projection.progress.entries()]);
		const result = await useCase.run(new Date("2026-10-23T10:02:00Z"));

		expect(result.processed).toEqual({ matches: 0 });
		expect([...projection.progress.entries()]).toEqual(snapshot);
	});

	it("accumulates across ticks in source order so a user's streak and progress build up", async () => {
		const rows = [
			facts({ sourceId: "row-1", createdAt: "2026-10-23 10:00:05.000456" }),
			facts({
				sourceId: "row-2",
				gameId: "game-2",
				createdAt: "2026-10-23 11:00:05.000456",
				date: new Date("2026-10-23T11:00:00Z"),
			}),
			facts({
				sourceId: "row-3",
				gameId: "game-3",
				createdAt: "2026-10-23 12:00:05.000456",
				date: new Date("2026-10-23T12:00:00Z"),
			}),
		];
		const projection = new FakeProjection();
		const useCase = new ProcessRewardsTick(
			[new FakeSource(rows)],
			projection,
			catalogRepository,
			new FakeUnitOfWork(),
			{ batchSize: 2, lagMs: 0 },
		);

		const first = await useCase.run(new Date("2026-10-23T13:00:00Z"));
		const second = await useCase.run(new Date("2026-10-23T13:00:00Z"));

		expect(first.processed).toEqual({ matches: 2 });
		expect(second.processed).toEqual({ matches: 1 });
		expect(projection.states.get("user-1")?.rankedStreak).toBe(3);
		expect(projection.progress.get("user-1|id-weekly_ranked_streak_3|2026-W43")?.completed).toBe(
			true,
		);
		expect(projection.progress.get("user-1|id-weekly_play_20|2026-W43")?.value).toBe(3);
	});

	it("leaves rows younger than the lag window for the next tick", async () => {
		const source = new FakeSource([facts({ createdAt: "2026-10-23 10:00:58.000456" })]);
		const projection = new FakeProjection();

		const result = await tick(source, projection).run(new Date("2026-10-23T10:01:00Z"));

		expect(result.processed).toEqual({ matches: 0 });
		expect(source.calls[0].notAfter).toEqual(new Date("2026-10-23T10:00:55Z"));
	});

	it("keeps the cursor at microsecond precision so the last processed row is never re-read", async () => {
		const row = facts({ createdAt: "2026-10-23 10:00:05.123456" });
		const projection = new FakeProjection();
		const useCase = tick(new FakeSource([row]), projection);

		await useCase.run(new Date("2026-10-23T10:01:00Z"));
		const again = await useCase.run(new Date("2026-10-23T10:01:03Z"));

		expect(projection.cursors.get("matches")?.lastCreatedAt).toBe("2026-10-23 10:00:05.123456");
		expect(again.processed).toEqual({ matches: 0 });
		expect(projection.progress.get("user-1|id-play_3|2026-10-23")?.value).toBe(1);
	});

	it("reports locked=false and touches nothing when another instance holds the lock", async () => {
		const source = new FakeSource([facts()]);
		const projection = new FakeProjection();

		const result = await tick(source, projection, new FakeUnitOfWork(false)).run(
			new Date("2026-10-23T10:01:00Z"),
		);

		expect(result).toEqual({ locked: false, processed: {} });
		expect(projection.cursors.size).toBe(0);
	});
});
