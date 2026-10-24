import { QueryableManager } from "../domain/EssenceLedgerRepository";
import { evaluateMatch, RewardState } from "../domain/evaluateMatch";
import { MatchSource, SourcedMatchFacts } from "../domain/MatchSource";
import { Mission } from "../domain/Mission";
import { MissionCatalogRepository } from "../domain/MissionCatalogRepository";
import { periodKey } from "../domain/MissionPeriod";
import { RewardsProjectionRepository } from "../domain/RewardsProjectionRepository";
import { RewardsUnitOfWork } from "../domain/RewardsUnitOfWork";
import { selectDailyMissions } from "../domain/selectDailyMissions";

export type TickOptions = {
	batchSize: number;
	// Rows younger than this are left for the next tick: a match's duels rows may still
	// be landing right after the match row.
	lagMs: number;
};

export type TickResult = {
	locked: boolean;
	processed: Record<string, number>;
};

// One pass of the rewards worker: for every source, drain one batch past its cursor,
// feed each match through the pure engine against the user's stored state, and persist
// progress, state and cursor in a single transaction. Facts are applied in source order
// per user, so streaks and "previous format" are exact.
export class ProcessRewardsTick {
	constructor(
		private readonly sources: MatchSource[],
		private readonly projection: RewardsProjectionRepository,
		private readonly catalog: MissionCatalogRepository,
		private readonly unitOfWork: RewardsUnitOfWork,
		private readonly options: TickOptions,
	) {}

	async run(now: Date): Promise<TickResult> {
		const notAfter = new Date(now.getTime() - this.options.lagMs);
		const missions = await this.catalog.findActive();

		const processed = await this.unitOfWork.run(async (manager) => {
			const counts: Record<string, number> = {};
			for (const source of this.sources) {
				counts[source.name] = await this.drain(source, missions, notAfter, manager);
			}
			return counts;
		});

		return processed === undefined ? { locked: false, processed: {} } : { locked: true, processed };
	}

	private async drain(
		source: MatchSource,
		missions: Mission[],
		notAfter: Date,
		manager: QueryableManager,
	): Promise<number> {
		const cursor = await this.projection.readCursor(source.name, manager);
		const batch = await source.fetchAfter(cursor, this.options.batchSize, notAfter);
		if (batch.length === 0) return 0;

		for (const facts of batch) {
			await this.apply(facts, missions, manager);
		}

		const last = batch[batch.length - 1];
		await this.projection.advanceCursor(
			source.name,
			{ lastCreatedAt: last.createdAt, lastId: last.sourceId },
			manager,
		);
		return batch.length;
	}

	private async apply(
		facts: SourcedMatchFacts,
		missions: Mission[],
		manager: QueryableManager,
	): Promise<void> {
		const dayKey = periodKey("daily", facts.date);
		const applicable = [
			...selectDailyMissions(missions, dayKey),
			...missions.filter((m) => m.period === "weekly" && m.active),
		];
		const pairs = applicable.map((m) => ({
			missionId: m.id,
			periodKey: periodKey(m.period, facts.date),
		}));
		const [rows, userState] = await Promise.all([
			this.projection.loadProgress(facts.userId, pairs, manager),
			this.projection.loadUserState(facts.userId, manager),
		]);

		const byMissionId = new Map(rows.map((row) => [row.missionId, row.value]));
		const state: RewardState = {
			progress: Object.fromEntries(applicable.map((m) => [m.code, byMissionId.get(m.id) ?? 0])),
			lastFormat: userState.lastFormat,
			rankedStreak: userState.rankedStreak,
		};

		const result = evaluateMatch(facts, state, applicable);
		const idByCode = new Map(applicable.map((m) => [m.code, m.id]));

		await this.projection.saveProgress(
			facts.userId,
			result.progress.map((p) => ({
				missionId: idByCode.get(p.missionCode) as string,
				periodKey: p.periodKey,
				value: p.value,
				completed: p.completed,
			})),
			manager,
		);
		await this.projection.saveUserState(
			facts.userId,
			{ lastFormat: result.state.lastFormat, rankedStreak: result.state.rankedStreak },
			manager,
		);
	}
}
