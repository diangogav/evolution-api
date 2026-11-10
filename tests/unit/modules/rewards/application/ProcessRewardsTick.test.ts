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
import {
	AchievementSource,
	AchievementWindow,
	UnlockedAchievement,
} from "../../../../../src/modules/rewards/domain/AchievementSource";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import { EssenceLedgerRepository } from "../../../../../src/modules/rewards/domain/EssenceLedgerRepository";

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

// The anti-join the Postgres source runs: paying unlocks inside the window with no
// achievement ledger row yet, oldest first.
class FakeAchievementSource implements AchievementSource {
	readonly name = "user_achievements";
	readonly calls: Array<{ window: AchievementWindow; limit: number }> = [];
	constructor(
		readonly rows: Array<UnlockedAchievement & { unlockedAt: string }>,
		private readonly ledger: FakeLedger,
	) {}

	async fetchUncredited(window: AchievementWindow, limit: number): Promise<UnlockedAchievement[]> {
		this.calls.push({ window, limit });
		return this.rows
			.filter((row) => row.essenceReward > 0)
			.filter((row) => row.unlockedAt >= toUtcTimestamp(window.notBefore))
			.filter((row) => row.unlockedAt <= toUtcTimestamp(window.notAfter))
			.filter(
				(row) =>
					!this.ledger.entries.some(
						(e) => e.kind === "achievement" && e.referenceKey === row.sourceId,
					),
			)
			.sort(
				(a, b) => a.unlockedAt.localeCompare(b.unlockedAt) || a.sourceId.localeCompare(b.sourceId),
			)
			.slice(0, limit)
			.map(({ sourceId, userId, essenceReward }) => ({ sourceId, userId, essenceReward }));
	}
}

class FakeLedger implements EssenceLedgerRepository {
	entries: EssenceLedgerEntry[] = [];
	async lockUser(): Promise<void> {
		return undefined;
	}
	async append(entry: EssenceLedgerEntry): Promise<"inserted" | "skipped"> {
		if (this.entries.some((e) => e.kind === entry.kind && e.referenceKey === entry.referenceKey))
			return "skipped";
		this.entries.push(entry);
		return "inserted";
	}
	async balanceOf(userId: string): Promise<number> {
		return this.entries.filter((e) => e.userId === userId).reduce((s, e) => s + e.delta, 0);
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

	describe("achievements", () => {
		const HOUR = 3_600_000;

		function crediting(rows: Array<UnlockedAchievement & { unlockedAt: string }>, batchSize = 100) {
			const projection = new FakeProjection();
			const ledger = new FakeLedger();
			const source = new FakeAchievementSource(rows, ledger);
			const useCase = new ProcessRewardsTick(
				[new FakeSource([])],
				projection,
				catalogRepository,
				new FakeUnitOfWork(),
				{ batchSize, lagMs: 5000 },
				{ sources: [source], ledger, windowMs: 168 * HOUR },
			);
			return { projection, ledger, source, useCase };
		}

		it("credits each paying unlock once, keyed by its row, and keeps no cursor for it", async () => {
			const { projection, ledger, useCase } = crediting([
				{
					sourceId: "ua-1",
					unlockedAt: "2026-10-23 10:00:05.000001",
					userId: "user-1",
					essenceReward: 30,
				},
				{
					sourceId: "ua-2",
					unlockedAt: "2026-10-23 10:00:06.000001",
					userId: "user-2",
					essenceReward: 0,
				},
			]);

			const result = await useCase.run(new Date("2026-10-23T10:01:00Z"));
			const again = await useCase.run(new Date("2026-10-23T10:02:00Z"));

			expect(result.processed).toEqual({ matches: 0, user_achievements: 1 });
			expect(ledger.entries).toEqual([
				{ userId: "user-1", kind: "achievement", referenceKey: "ua-1", delta: 30 },
			]);
			expect(projection.cursors.has("user_achievements")).toBe(false);
			expect(again.processed).toEqual({ matches: 0, user_achievements: 0 });
			expect(ledger.entries).toHaveLength(1);
		});

		it("still credits a row committed after later rows were already credited", async () => {
			const { ledger, source, useCase } = crediting([
				{
					sourceId: "ua-2",
					unlockedAt: "2026-10-23 10:00:30.000000",
					userId: "user-2",
					essenceReward: 40,
				},
			]);

			await useCase.run(new Date("2026-10-23T10:01:00Z"));
			// Stamped before ua-2 but committed after the tick that credited it.
			source.rows.push({
				sourceId: "ua-1",
				unlockedAt: "2026-10-23 10:00:10.000000",
				userId: "user-1",
				essenceReward: 30,
			});
			const late = await useCase.run(new Date("2026-10-23T10:02:00Z"));

			expect(late.processed).toEqual({ matches: 0, user_achievements: 1 });
			expect(ledger.entries.map((e) => e.referenceKey)).toEqual(["ua-2", "ua-1"]);
		});

		it("asks for unlocks between the window's start and the lag bound, one batch at a time", async () => {
			const rows = ["ua-1", "ua-2", "ua-3"].map((sourceId, i) => ({
				sourceId,
				unlockedAt: `2026-10-23 10:00:0${i}.000000`,
				userId: "user-1",
				essenceReward: 10,
			}));
			const { ledger, source, useCase } = crediting(rows, 2);

			const first = await useCase.run(new Date("2026-10-23T10:01:00Z"));
			const second = await useCase.run(new Date("2026-10-23T10:01:00Z"));

			expect(source.calls[0]).toEqual({
				window: {
					notBefore: new Date("2026-10-16T10:01:00Z"),
					notAfter: new Date("2026-10-23T10:00:55Z"),
				},
				limit: 2,
			});
			expect(first.processed.user_achievements).toBe(2);
			expect(second.processed.user_achievements).toBe(1);
			expect(ledger.entries.map((e) => e.referenceKey)).toEqual(["ua-1", "ua-2", "ua-3"]);
		});

		it("counts a row another writer credited in the meantime without crediting it twice", async () => {
			const { ledger, useCase } = crediting([
				{
					sourceId: "ua-1",
					unlockedAt: "2026-10-23 10:00:05.000001",
					userId: "user-1",
					essenceReward: 30,
				},
			]);
			const append = ledger.append.bind(ledger);
			// Lightning completion commits the same credit between the read and the append.
			ledger.append = async (entry) => {
				await append(entry);
				return append(entry);
			};

			const result = await useCase.run(new Date("2026-10-23T10:01:00Z"));

			expect(result.processed.user_achievements).toBe(1);
			expect(ledger.entries).toHaveLength(1);
		});
	});
});
