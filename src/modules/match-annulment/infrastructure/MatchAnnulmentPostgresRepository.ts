import { dataSource } from "../../../evolution-types/src/data-source";
import { PointsLedgerEntry } from "../../points-ledger/domain/PointsLedgerEntry";
import { PointsLedgerRepository } from "../../points-ledger/domain/PointsLedgerRepository";
import { nextCycle, projectPlayerStats } from "../../points-ledger/domain/PointsProjection";
import { AnnulmentRequest } from "../domain/AnnulmentRequest";
import { MatchAnnulmentRepository, QueryableManager } from "../domain/MatchAnnulmentRepository";
import { PhaseOneResult, TouchedKey } from "../domain/PhaseOneResult";

type SummaryKey = { day: string; banListName: string; season: number };

const GAME_LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended('game:' || length($1)::text || ':' || $1, 0))`;
const LADDER_LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended($1 || '|' || $2 || '|' || $3, 0))`;
const EXISTENCE_QUERY = `SELECT count(*)::int AS rows, bool_or(anulled) AS flagged FROM matches WHERE game_id = $1 AND deleted_at IS NULL`;
const SUMMARY_KEY_QUERY = `SELECT DISTINCT date_trunc('day', date)::date AS day, ban_list_name AS "banListName", season FROM matches WHERE game_id = $1`;
const REVERSED_QUERY = `SELECT EXISTS (SELECT 1 FROM points_ledger WHERE game_id = $1 AND kind = 'reversal') AS reversed`;
const GATE_QUERY = `UPDATE matches SET anulled = true, anulled_user_id = COALESCE(anulled_user_id, $2), anulled_reason = COALESCE(anulled_reason, $3), anulled_by = COALESCE(anulled_by, $4) WHERE game_id = $1`;
const RANK_NAME_QUERY = `SELECT name FROM ranks WHERE id = $1`;
const PLAYER_STATS_QUERY = `SELECT wins, losses, points FROM player_stats WHERE user_id = $1 AND rank_id = $2 AND season = $3`;
const SUMMARY_DECREMENT_QUERY = `UPDATE stats_daily_summary SET total_duels = GREATEST(total_duels - 1, 0) WHERE date = $1 AND ban_list_name = $2 AND season = $3`;

// Forces the surrounding dataSource.transaction() to roll back a write already made (the gate).
class PhaseOneConflict extends Error {
	constructor(public readonly reason: string) {
		super(reason);
	}
}

export class MatchAnnulmentPostgresRepository implements MatchAnnulmentRepository {
	constructor(private readonly ledger: PointsLedgerRepository) {}

	async annulPhaseOne(
		request: AnnulmentRequest,
		manager?: QueryableManager,
	): Promise<PhaseOneResult> {
		try {
			if (manager) return await this.phaseOne(manager, request);
			return await dataSource.transaction((tx) =>
				this.phaseOne(tx as unknown as QueryableManager, request),
			);
		} catch (error) {
			if (error instanceof PhaseOneConflict) return { outcome: "conflict", reason: error.reason };
			throw error;
		}
	}

	private async phaseOne(
		manager: QueryableManager,
		request: AnnulmentRequest,
	): Promise<PhaseOneResult> {
		const { gameId } = request;
		await manager.query(GAME_LOCK_QUERY, [gameId]);
		const [existenceRow] = (await manager.query(EXISTENCE_QUERY, [gameId])) as {
			rows: number;
			flagged: boolean;
		}[];
		if (!existenceRow || existenceRow.rows === 0) return { outcome: "not-found" };

		const summaryRows = (await manager.query(SUMMARY_KEY_QUERY, [gameId])) as SummaryKey[];
		if (summaryRows.length > 1) return { outcome: "conflict", reason: "summary-key-mismatch" };

		const [reversedRow] = (await manager.query(REVERSED_QUERY, [gameId])) as {
			reversed: boolean;
		}[];
		const reversed = Boolean(reversedRow?.reversed);
		if (existenceRow.flagged && reversed) return { outcome: "already" };

		await manager.query(GATE_QUERY, [
			gameId,
			request.offenderUserId,
			request.reason,
			request.adminUserId,
		]);

		const sourceRows = await this.ledger.findAppliedEntries(gameId, manager);
		const touchedKeys = this.dedupeKeys(sourceRows);

		const achievementPoints = new Map<string, number>();
		for (const key of touchedKeys) {
			const rankName = await this.readRankName(manager, key.rankId);
			const points = await this.ledger.findAchievementPoints(
				key.userId,
				rankName,
				key.season,
				manager,
			);
			achievementPoints.set(this.keyId(key), points);
			await manager.query(LADDER_LOCK_QUERY, [key.userId, key.rankId, key.season]);
			await this.checkReconciliation(manager, key, points);
		}

		for (const source of sourceRows) {
			await this.writeReversal(manager, gameId, source);
		}
		for (const key of touchedKeys) {
			const points = achievementPoints.get(this.keyId(key))!;
			await this.ledger.reprojectPlayerStats(key.userId, key.rankId, key.season, points, manager);
		}

		const summary = summaryRows[0];
		await manager.query(SUMMARY_DECREMENT_QUERY, [
			summary.day,
			summary.banListName,
			summary.season,
		]);
		return { outcome: "annulled", touchedKeys, reversed };
	}

	private async writeReversal(
		manager: QueryableManager,
		gameId: string,
		source: PointsLedgerEntry,
	): Promise<void> {
		const reversalCount = await this.ledger.countByKind(
			gameId,
			source.userId,
			source.rankId,
			"reversal",
			manager,
		);
		const reinstatementCount = await this.ledger.countByKind(
			gameId,
			source.userId,
			source.rankId,
			"reinstatement",
			manager,
		);
		const cycle = nextCycle("reversal", { reversalCount, reinstatementCount });
		const entry: PointsLedgerEntry = {
			gameId,
			userId: source.userId,
			rankId: source.rankId,
			season: source.season,
			kind: "reversal",
			cycle,
			pointsDelta: -source.pointsDelta,
			winsDelta: -source.winsDelta,
			lossesDelta: -source.lossesDelta,
		};
		await this.ledger.insertEntry(entry, manager);
	}

	private dedupeKeys(rows: PointsLedgerEntry[]): TouchedKey[] {
		const byKey = new Map<string, TouchedKey>();
		for (const row of rows) {
			const key = { userId: row.userId, rankId: row.rankId, season: row.season };
			byKey.set(this.keyId(key), key);
		}
		return [...byKey.values()].sort((a, b) => this.keyId(a).localeCompare(this.keyId(b)));
	}

	private keyId(key: TouchedKey): string {
		return `${key.userId}:${key.rankId}:${key.season}`;
	}

	private async readRankName(manager: QueryableManager, rankId: string): Promise<string> {
		const [row] = (await manager.query(RANK_NAME_QUERY, [rankId])) as { name: string }[];
		return row?.name ?? "";
	}

	private async checkReconciliation(
		manager: QueryableManager,
		key: TouchedKey,
		achievementPoints: number,
	): Promise<void> {
		const entries = await this.ledger.findEntriesForKey(
			key.userId,
			key.rankId,
			key.season,
			manager,
		);
		const expected = projectPlayerStats(entries, achievementPoints);
		const [current] = (await manager.query(PLAYER_STATS_QUERY, [
			key.userId,
			key.rankId,
			key.season,
		])) as {
			wins: number;
			losses: number;
			points: number;
		}[];
		const actual = current ?? { wins: 0, losses: 0, points: 0 };
		if (
			expected.wins !== actual.wins ||
			expected.losses !== actual.losses ||
			expected.points !== actual.points
		) {
			throw new PhaseOneConflict(`reconciliation-drift:${key.userId}:${key.rankId}:${key.season}`);
		}
	}
}
