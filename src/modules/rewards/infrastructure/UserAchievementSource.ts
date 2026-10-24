import { dataSource } from "../../../evolution-types/src/data-source";
import { AchievementSource, UnlockedAchievement } from "../domain/AchievementSource";
import { SourceCursor } from "../domain/MatchSource";
import { toUtcTimestamp } from "./RankedMatchSource";

// user_achievements is written by the game server when a player unlocks an achievement;
// the essence comes from the achievements catalog (soft-deleted entries pay nothing).
// unlocked_at is `timestamp without time zone` in UTC and is read as microsecond text
// for the same reasons as matches.created_at (see RankedMatchSource).
const FETCH_QUERY = `SELECT ua.id AS "sourceId", to_char(ua.unlocked_at, 'YYYY-MM-DD HH24:MI:SS.US') AS "createdAt",
	ua.user_id AS "userId", a.essence_reward AS "essenceReward"
	FROM user_achievements ua
	JOIN achievements a ON a.id = ua.achievement_id AND a.deleted_at IS NULL
	WHERE ($1::timestamp IS NULL OR (ua.unlocked_at, ua.id) > ($1::timestamp, $2::uuid))
	  AND ua.unlocked_at <= $3::timestamp
	ORDER BY ua.unlocked_at ASC, ua.id ASC
	LIMIT $4`;

export class UserAchievementSource implements AchievementSource {
	readonly name = "user_achievements";

	async fetchAfter(
		cursor: SourceCursor,
		limit: number,
		notAfter: Date,
	): Promise<UnlockedAchievement[]> {
		const params = [cursor.lastCreatedAt, cursor.lastId, toUtcTimestamp(notAfter), limit];
		const rows = (await dataSource.query(FETCH_QUERY, params)) as UnlockedAchievement[];
		return rows.map((row) => ({
			sourceId: row.sourceId,
			createdAt: row.createdAt,
			userId: row.userId,
			essenceReward: row.essenceReward,
		}));
	}
}
