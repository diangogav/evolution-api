import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import {
	CatalogLightningAchievement,
	LightningAchievementGrant,
	LightningAchievementGrants,
} from "../domain/LightningAchievementGrants";

const FIND_BY_CODES_QUERY = `SELECT id, code, name, essence_reward FROM achievements
	WHERE code = ANY($1) AND deleted_at IS NULL`;

// The duel server's awarder takes this very key (UserAchievementPostgresRepository), so the
// "already held?" read and the insert never interleave with a server unlock for the player.
const LOCK_PLAYER_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended('user_achievements:' || $1, 0))`;

const HELD_QUERY = `SELECT DISTINCT achievement_id FROM user_achievements
	WHERE user_id = $1 AND achievement_id = ANY($2)`;

// Same row shape as the server: a random uuid, labels as JSON text (empty: no ladder, so
// the points ledger never adds these to ranked points), and unlocked_at as a UTC wall-clock
// `timestamp without time zone`, which is what the rewards worker orders by. The id comes
// back because the row's essence is credited under it in the same transaction.
const GRANT_QUERY = `INSERT INTO user_achievements (id, user_id, achievement_id, labels, unlocked_at, season)
	VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamp, $5) RETURNING id`;

type CatalogRow = {
	id: number | string;
	code: string;
	name: string;
	essence_reward: number | string;
};

export function toUtcWallClock(date: Date): string {
	return date.toISOString().replace("T", " ").replace("Z", "");
}

export class LightningAchievementGrantsPostgresRepository implements LightningAchievementGrants {
	async findByCodes(
		codes: readonly string[],
		manager: QueryableManager,
	): Promise<CatalogLightningAchievement[]> {
		if (codes.length === 0) return [];
		const rows = await runQuery<CatalogRow>(FIND_BY_CODES_QUERY, [[...codes]], manager);
		return rows.map((row) => ({
			id: Number(row.id),
			code: row.code,
			name: row.name,
			essenceReward: Number(row.essence_reward),
		}));
	}

	async lockPlayer(userId: string, manager: QueryableManager): Promise<void> {
		await runQuery(LOCK_PLAYER_QUERY, [userId], manager);
	}

	async heldAchievementIds(
		userId: string,
		achievementIds: number[],
		manager: QueryableManager,
	): Promise<Set<number>> {
		if (achievementIds.length === 0) return new Set();
		const rows = await runQuery<{ achievement_id: number | string }>(
			HELD_QUERY,
			[userId, achievementIds],
			manager,
		);
		return new Set(rows.map((row) => Number(row.achievement_id)));
	}

	async grant(grant: LightningAchievementGrant, manager: QueryableManager): Promise<string> {
		const [row] = await runQuery<{ id: string }>(
			GRANT_QUERY,
			[
				grant.userId,
				grant.achievementId,
				JSON.stringify([]),
				toUtcWallClock(grant.unlockedAt),
				grant.season,
			],
			manager,
		);
		if (!row) throw new Error("user_achievements insert returned no id");
		return row.id;
	}
}
