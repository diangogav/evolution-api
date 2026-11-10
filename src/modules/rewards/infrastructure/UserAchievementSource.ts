import {
	AchievementSource,
	AchievementWindow,
	UnlockedAchievement,
} from "../domain/AchievementSource";
import { QueryableManager } from "../domain/EssenceLedgerRepository";
import { toUtcTimestamp } from "./RankedMatchSource";

// user_achievements is written by the game server when a player unlocks an achievement,
// and by lightning completion; the essence reward comes from the achievements catalog
// (soft-deleted entries pay nothing). unlocked_at is `timestamp without time zone` in UTC.
// What is pending is decided by an anti-join against the ledger, never by a cursor: a row
// committed after later-stamped rows were credited is still found. The NOT EXISTS probe is
// served by the ledger's unique (user_id, kind, reference_key) index.
const FETCH_UNCREDITED_QUERY = `SELECT ua.id AS "sourceId", ua.user_id AS "userId", a.essence_reward AS "essenceReward"
	FROM user_achievements ua
	JOIN achievements a ON a.id = ua.achievement_id AND a.deleted_at IS NULL AND a.essence_reward > 0
	WHERE ua.unlocked_at >= $1::timestamp AND ua.unlocked_at <= $2::timestamp
	  AND NOT EXISTS (
		SELECT 1 FROM essence_ledger el
		WHERE el.user_id = ua.user_id AND el.kind = 'achievement' AND el.reference_key = ua.id::text
	  )
	ORDER BY ua.unlocked_at ASC, ua.id ASC
	LIMIT $3`;

type UncreditedRow = {
	sourceId: string;
	userId: string;
	essenceReward: number | string;
};

// Same database as the ledger, so the read runs on the tick's transaction.
export class UserAchievementSource implements AchievementSource {
	readonly name = "user_achievements";

	async fetchUncredited(
		window: AchievementWindow,
		limit: number,
		manager: QueryableManager,
	): Promise<UnlockedAchievement[]> {
		const params = [toUtcTimestamp(window.notBefore), toUtcTimestamp(window.notAfter), limit];
		const rows = (await manager.query(FETCH_UNCREDITED_QUERY, params)) as UncreditedRow[];
		return rows.map((row) => ({
			sourceId: row.sourceId,
			userId: row.userId,
			essenceReward: Number(row.essenceReward),
		}));
	}
}
