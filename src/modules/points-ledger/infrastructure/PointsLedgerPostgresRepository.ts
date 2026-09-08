import { dataSource } from "../../../evolution-types/src/data-source";
import { PointsLedgerEntry, PointsLedgerKind } from "../domain/PointsLedgerEntry";
import {
	InsertLedgerEntryResult,
	PointsLedgerRepository,
	QueryableManager,
} from "../domain/PointsLedgerRepository";
import { projectPlayerStats } from "../domain/PointsProjection";

// Same pipe-joined encoding RatingCompensationPostgresRepository already
// uses; the game server's differs (pre-existing, out of scope here).
const ADVISORY_LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended($1 || '|' || $2 || '|' || $3, 0))`;

const LEDGER_COLUMNS = `game_id AS "gameId", user_id AS "userId", rank_id AS "rankId", season,
	kind, cycle, points_delta AS "pointsDelta", wins_delta AS "winsDelta", losses_delta AS "lossesDelta"`;

const FIND_APPLIED_ENTRIES_QUERY = `SELECT ${LEDGER_COLUMNS} FROM points_ledger WHERE game_id = $1 AND kind = 'applied'`;

const FIND_ENTRIES_FOR_KEY_QUERY = `SELECT ${LEDGER_COLUMNS} FROM points_ledger
	WHERE user_id = $1 AND rank_id = $2 AND season = $3 ORDER BY created_at ASC, id ASC`;

// Target-less ON CONFLICT DO NOTHING (D9): forward compatible with the
// (game_id, user_id, rank_id, kind, cycle) unique index without naming it.
const INSERT_ENTRY_QUERY = `INSERT INTO points_ledger
	   (game_id, user_id, rank_id, season, kind, cycle, points_delta, wins_delta, losses_delta)
	 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING RETURNING id`;

const COUNT_BY_KIND_QUERY = `SELECT count(*)::int AS count FROM points_ledger
	WHERE game_id = $1 AND user_id = $2 AND rank_id = $3 AND kind = $4`;

// Mirrors rebuild-player-stats.sql's achievement_points CTE, keyed on rank
// name: achievement labels name ban-list ladders, not rank ids.
const ACHIEVEMENT_POINTS_QUERY = `SELECT COALESCE(SUM(a.earned_points), 0)::int AS points
	FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
	CROSS JOIN LATERAL json_array_elements_text(ua.labels) AS label
	WHERE ua.user_id = $1 AND ua.season = $2 AND label = $3`;

const UPSERT_PLAYER_STATS_QUERY = `INSERT INTO player_stats (user_id, rank_id, season, wins, losses, points)
	VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, rank_id, season)
	DO UPDATE SET wins = EXCLUDED.wins, losses = EXCLUDED.losses, points = EXCLUDED.points`;

export class PointsLedgerPostgresRepository implements PointsLedgerRepository {
	async findAppliedEntries(
		gameId: string,
		manager?: QueryableManager,
	): Promise<PointsLedgerEntry[]> {
		return this.query(FIND_APPLIED_ENTRIES_QUERY, [gameId], manager);
	}

	async findEntriesForKey(
		userId: string,
		rankId: string,
		season: number,
		manager?: QueryableManager,
	): Promise<PointsLedgerEntry[]> {
		return this.query(FIND_ENTRIES_FOR_KEY_QUERY, [userId, rankId, season], manager);
	}

	async insertEntry(
		entry: PointsLedgerEntry,
		manager?: QueryableManager,
	): Promise<InsertLedgerEntryResult> {
		const params = [
			entry.gameId,
			entry.userId,
			entry.rankId,
			entry.season,
			entry.kind,
			entry.cycle,
			entry.pointsDelta,
			entry.winsDelta,
			entry.lossesDelta,
		];
		const inserted = await this.query<{ id: string }>(INSERT_ENTRY_QUERY, params, manager);
		return inserted.length > 0 ? "inserted" : "skipped";
	}

	async countByKind(
		gameId: string,
		userId: string,
		rankId: string,
		kind: PointsLedgerKind,
		manager?: QueryableManager,
	): Promise<number> {
		const params = [gameId, userId, rankId, kind];
		const rows = await this.query<{ count: number }>(COUNT_BY_KIND_QUERY, params, manager);
		return rows[0]?.count ?? 0;
	}

	async findAchievementPoints(
		userId: string,
		rankName: string,
		season: number,
		manager?: QueryableManager,
	): Promise<number> {
		const params = [userId, season, rankName];
		const rows = await this.query<{ points: number }>(ACHIEVEMENT_POINTS_QUERY, params, manager);
		return rows[0]?.points ?? 0;
	}

	async reprojectPlayerStats(
		userId: string,
		rankId: string,
		season: number,
		achievementPoints: number,
		manager?: QueryableManager,
	): Promise<void> {
		if (manager) {
			await this.reprojectWithManager(manager, userId, rankId, season, achievementPoints);
			return;
		}

		await dataSource.transaction((txManager) =>
			this.reprojectWithManager(
				txManager as QueryableManager,
				userId,
				rankId,
				season,
				achievementPoints,
			),
		);
	}

	private async reprojectWithManager(
		manager: QueryableManager,
		userId: string,
		rankId: string,
		season: number,
		achievementPoints: number,
	): Promise<void> {
		await manager.query(ADVISORY_LOCK_QUERY, [userId, rankId, season]);

		const entries = await this.findEntriesForKey(userId, rankId, season, manager);
		const projected = projectPlayerStats(entries, achievementPoints);
		const params = [userId, rankId, season, projected.wins, projected.losses, projected.points];

		await manager.query(UPSERT_PLAYER_STATS_QUERY, params);
	}

	private async query<T>(sql: string, params: unknown[], manager?: QueryableManager): Promise<T[]> {
		return (await (manager ?? dataSource).query(sql, params)) as T[];
	}
}
