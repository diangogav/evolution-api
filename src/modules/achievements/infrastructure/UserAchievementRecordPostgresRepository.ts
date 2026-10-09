import { dataSource } from "../../../evolution-types/src/data-source";
import { LadderGroup } from "../domain/ladderWins";
import {
	UserAchievementRecordRepository,
	UserAward,
} from "../domain/UserAchievementRecordRepository";

// Same eligibility as the game server awarder; matches the partial index
// (user_id, date DESC) WHERE anulled = false AND deleted_at IS NULL.
const ELIGIBLE = "user_id = $1 AND anulled = false AND deleted_at IS NULL";

const STREAK_WINDOW = 200;

export class UserAchievementRecordPostgresRepository implements UserAchievementRecordRepository {
	async userExists(userId: string): Promise<boolean> {
		const rows: unknown[] = await dataSource.query(
			"SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
			[userId],
		);

		return rows.length > 0;
	}

	async findAwards(userId: string): Promise<UserAward[]> {
		const rows: Array<{
			award_id: string;
			id: number;
			code: string | null;
			icon: string;
			name: string;
			description: string;
			labels: string[] | null;
			unlocked_at: Date;
			season: number;
			earned_points: number;
		}> = await dataSource.query(
			`SELECT ua.id AS award_id, a.id, a.code, a.icon, a.name, a.description,
			        ua.labels, ua.unlocked_at, ua.season, a.earned_points
			 FROM user_achievements ua
			 JOIN achievements a ON a.id = ua.achievement_id
			 WHERE ua.user_id = $1
			 ORDER BY ua.unlocked_at DESC, ua.id`,
			[userId],
		);

		return rows.map((row) => ({
			awardId: row.award_id,
			id: Number(row.id),
			code: row.code,
			icon: row.icon,
			name: row.name,
			description: row.description,
			labels: row.labels ?? [],
			unlockedAt: new Date(row.unlocked_at),
			season: Number(row.season),
			earnedPoints: Number(row.earned_points),
		}));
	}

	async findTotals(userId: string): Promise<{ rankedMatches: number; rankedWins: number }> {
		const [row]: Array<{ matches: string; wins: string }> = await dataSource.query(
			`SELECT count(*) AS matches, count(*) FILTER (WHERE winner) AS wins
			 FROM matches WHERE ${ELIGIBLE}`,
			[userId],
		);

		return { rankedMatches: Number(row.matches), rankedWins: Number(row.wins) };
	}

	async findWinningBanLists(userId: string): Promise<string[]> {
		const rows: Array<{ ban_list_name: string }> = await dataSource.query(
			`SELECT DISTINCT ban_list_name FROM matches WHERE ${ELIGIBLE} AND winner = true`,
			[userId],
		);

		return rows.map((row) => row.ban_list_name);
	}

	async findLatestOutcomes(userId: string): Promise<boolean[]> {
		const rows: Array<{ winner: boolean }> = await dataSource.query(
			`SELECT winner FROM matches WHERE ${ELIGIBLE}
			 ORDER BY date DESC, created_at DESC, id DESC LIMIT ${STREAK_WINDOW}`,
			[userId],
		);

		return rows.map((row) => row.winner);
	}

	async findLadderGroups(): Promise<LadderGroup[]> {
		const rows: Array<{ name: string; pattern: string }> = await dataSource.query(
			`SELECT ranks.name, rank_members.pattern
			 FROM ranks
			 JOIN rank_members ON rank_members.rank_id = ranks.id
			 WHERE ranks.type = 'group' AND ranks.enabled = true`,
		);

		const byName = new Map<string, string[]>();

		for (const { name, pattern } of rows) {
			byName.set(name, [...(byName.get(name) ?? []), pattern]);
		}

		return [...byName].map(([name, patterns]) => ({ name, patterns }));
	}
}
