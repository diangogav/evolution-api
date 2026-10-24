import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { QueryableManager } from "../domain/EssenceLedgerRepository";
import { SourceCursor } from "../domain/MatchSource";
import {
	ProgressRow,
	RewardsProjectionRepository,
	UserRewardState,
} from "../domain/RewardsProjectionRepository";

// The cursor instant travels as UTC text with microseconds in both directions; a JS Date
// would truncate it to milliseconds and re-read the last processed row (see SourceCursor).
const READ_CURSOR_QUERY = `SELECT to_char(last_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS "lastCreatedAt",
	last_id AS "lastId" FROM rewards_cursor WHERE source = $1`;

const ADVANCE_CURSOR_QUERY = `INSERT INTO rewards_cursor (source, last_created_at, last_id)
	VALUES ($1, ($2::timestamp AT TIME ZONE 'UTC'), $3) ON CONFLICT (source) DO UPDATE
	SET last_created_at = EXCLUDED.last_created_at, last_id = EXCLUDED.last_id, updated_at = now()`;

const LOAD_PROGRESS_QUERY = `SELECT mission_id AS "missionId", period_key AS "periodKey", value,
	(completed_at IS NOT NULL) AS completed
	FROM mission_progress WHERE user_id = $1 AND (mission_id, period_key) IN
	(SELECT unnest($2::uuid[]), unnest($3::text[]))`;

// completed_at is set the first time a mission completes and never cleared, so a
// streak that later breaks within the period keeps its completion.
const SAVE_PROGRESS_QUERY = `INSERT INTO mission_progress (user_id, mission_id, period_key, value, completed_at)
	VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() ELSE NULL END)
	ON CONFLICT (user_id, mission_id, period_key) DO UPDATE
	SET value = EXCLUDED.value,
	    completed_at = COALESCE(mission_progress.completed_at, EXCLUDED.completed_at),
	    updated_at = now()`;

const LOAD_STATE_QUERY = `SELECT last_format AS "lastFormat", ranked_streak AS "rankedStreak"
	FROM user_reward_state WHERE user_id = $1`;

const SAVE_STATE_QUERY = `INSERT INTO user_reward_state (user_id, last_format, ranked_streak)
	VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE
	SET last_format = EXCLUDED.last_format, ranked_streak = EXCLUDED.ranked_streak, updated_at = now()`;

export class RewardsProjectionPostgresRepository implements RewardsProjectionRepository {
	async readCursor(source: string, manager?: QueryableManager): Promise<SourceCursor> {
		const rows = await this.query<SourceCursor>(READ_CURSOR_QUERY, [source], manager);
		return rows[0] ?? { lastCreatedAt: null, lastId: null };
	}

	async advanceCursor(
		source: string,
		cursor: SourceCursor,
		manager?: QueryableManager,
	): Promise<void> {
		await this.query(ADVANCE_CURSOR_QUERY, [source, cursor.lastCreatedAt, cursor.lastId], manager);
	}

	async loadProgress(
		userId: string,
		pairs: Array<{ missionId: string; periodKey: string }>,
		manager?: QueryableManager,
	): Promise<ProgressRow[]> {
		if (pairs.length === 0) return [];
		const params = [userId, pairs.map((p) => p.missionId), pairs.map((p) => p.periodKey)];
		return this.query<ProgressRow>(LOAD_PROGRESS_QUERY, params, manager);
	}

	async saveProgress(
		userId: string,
		rows: ProgressRow[],
		manager?: QueryableManager,
	): Promise<void> {
		for (const row of rows) {
			const params = [userId, row.missionId, row.periodKey, row.value, row.completed];
			await this.query(SAVE_PROGRESS_QUERY, params, manager);
		}
	}

	async loadUserState(userId: string, manager?: QueryableManager): Promise<UserRewardState> {
		const rows = await this.query<UserRewardState>(LOAD_STATE_QUERY, [userId], manager);
		return rows[0] ?? { lastFormat: null, rankedStreak: 0 };
	}

	async saveUserState(
		userId: string,
		state: UserRewardState,
		manager?: QueryableManager,
	): Promise<void> {
		await this.query(SAVE_STATE_QUERY, [userId, state.lastFormat, state.rankedStreak], manager);
	}

	private async query<T>(sql: string, params: unknown[], manager?: QueryableManager): Promise<T[]> {
		const runner = manager ?? cosmeticsDataSource;
		return (await runner.query(sql, params)) as T[];
	}
}
