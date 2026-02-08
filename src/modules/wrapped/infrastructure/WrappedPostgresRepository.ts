import { dataSource } from "../../../evolution-types/src/data-source";
import type { Achievement } from "../domain/Achievement";
import { BanListStats } from "../domain/BanListStats";
import type { ExtraStats } from "../domain/ExtraStats";
import { Nemesis } from "../domain/Nemesis";
import { calculateRankBadge, type PlayerRanking } from "../domain/PlayerRanking";
import { PlayerSeasonStats } from "../domain/PlayerSeasonStats";
import { SeasonWrapped } from "../domain/SeasonWrapped";
import type { WrappedRepository } from "../domain/WrappedRepository";

export class WrappedPostgresRepository implements WrappedRepository {
    async getSeasonWrappedData(seasonId: number, playerId: string): Promise<SeasonWrapped | null> {
        // Check if player exists
        const player = await dataSource.query(
            "SELECT id, username, avatar FROM users WHERE id = $1 AND deleted_at IS NULL",
            [playerId],
        );

        if (!player || player.length === 0) {
            return null;
        }

        const playerData = player[0];

        // Get global stats
        const globalStats = await this.getGlobalStats(seasonId, playerId);

        // If no matches, return empty wrapped
        if (globalStats.totalMatches === 0) {
            return new SeasonWrapped(
                playerId,
                playerData.username,
                playerData.avatar,
                seasonId,
                `Season ${seasonId}`,
                { start: new Date(), end: new Date() },
                globalStats,
                [],
                null,
                null,
                [],
                { position: 0, totalPlayers: 0, points: 0, rankBadge: "Challenger" },
                { mostPlayedBanList: null, uniqueOpponents: 0, bestDay: null },
            );
        }

        // Get stats per ban list
        const banListStats = await this.getBanListStats(seasonId, playerId);

        // Get nemesis and victim
        const nemesis = await this.getNemesis(seasonId, playerId);
        const victim = await this.getVictim(seasonId, playerId);

        // Get achievements
        const achievements = await this.getAchievements(seasonId, playerId);

        // Get ranking
        const ranking = await this.getRanking(seasonId, playerId);

        // Get extra stats
        const extraStats = await this.getExtraStats(seasonId, playerId, banListStats);

        return new SeasonWrapped(
            playerId,
            playerData.username,
            playerData.avatar,
            seasonId,
            `Season ${seasonId}`,
            {
                start: globalStats.firstMatchDate ?? new Date(),
                end: globalStats.lastMatchDate ?? new Date(),
            },
            globalStats,
            banListStats,
            nemesis,
            victim,
            achievements,
            ranking,
            extraStats,
        );
    }

    private async getGlobalStats(seasonId: number, playerId: string): Promise<PlayerSeasonStats> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await dataSource.query(
            `
			SELECT
				COUNT(*)::int AS total_matches,
				COUNT(*) FILTER (WHERE winner = true)::int AS wins,
				COUNT(*) FILTER (WHERE winner = false)::int AS losses,
				COUNT(*) FILTER (WHERE player_score = opponent_score)::int AS draws,
				COALESCE(
					(COUNT(*) FILTER (WHERE winner = true)::float / 
					NULLIF(COUNT(*) FILTER (WHERE winner = true OR winner = false), 0)) * 100,
					0
				) AS winrate,
				MIN(date) AS first_match,
				MAX(date) AS last_match,
				COUNT(DISTINCT DATE(date))::int AS active_days
			FROM matches
			WHERE season = $1 
				AND user_id = $2
				AND anulled = false
				AND deleted_at IS NULL
		`,
            [seasonId, playerId],
        );

        const stats = result[0];

        // Calculate streaks
        const streaks = await this.calculateStreaks(seasonId, playerId);

        // Calculate avg matches per day and week
        const avgMatchesPerDay = stats.active_days > 0 ? stats.total_matches / stats.active_days : 0;
        const avgMatchesPerWeek = avgMatchesPerDay * 7;

        return new PlayerSeasonStats(
            stats.total_matches,
            stats.wins,
            stats.losses,
            stats.draws,
            Math.round(stats.winrate * 10) / 10,
            streaks.bestWinStreak,
            streaks.worstLoseStreak,
            Math.round(avgMatchesPerDay * 10) / 10,
            Math.round(avgMatchesPerWeek * 10) / 10,
            stats.first_match,
            stats.last_match,
            stats.active_days,
        );
    }

    private async calculateStreaks(
        seasonId: number,
        playerId: string,
    ): Promise<{ bestWinStreak: number; worstLoseStreak: number }> {
        const matches = await dataSource.query(
            `
			SELECT winner
			FROM matches
			WHERE season = $1 
				AND user_id = $2
				AND anulled = false
				AND deleted_at IS NULL
			ORDER BY date ASC
		`,
            [seasonId, playerId],
        );

        let bestWinStreak = 0;
        let currentWinStreak = 0;
        let worstLoseStreak = 0;
        let currentLoseStreak = 0;

        for (const match of matches) {
            if (match.winner) {
                currentWinStreak++;
                currentLoseStreak = 0;
                bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
            } else {
                currentLoseStreak++;
                currentWinStreak = 0;
                worstLoseStreak = Math.max(worstLoseStreak, currentLoseStreak);
            }
        }

        return { bestWinStreak, worstLoseStreak };
    }

    private async getBanListStats(seasonId: number, playerId: string): Promise<BanListStats[]> {
        const results = await dataSource.query(
            `
			SELECT
				ban_list_name,
				COUNT(*)::int AS matches,
				COUNT(*) FILTER (WHERE winner = true)::int AS wins,
				COUNT(*) FILTER (WHERE winner = false)::int AS losses,
				COUNT(*) FILTER (WHERE player_score = opponent_score)::int AS draws,
				COALESCE(
					(COUNT(*) FILTER (WHERE winner = true)::float / 
					NULLIF(COUNT(*) FILTER (WHERE winner = true OR winner = false), 0)) * 100,
					0
				) AS winrate
			FROM matches
			WHERE season = $1 
				AND user_id = $2
				AND anulled = false
				AND deleted_at IS NULL
			GROUP BY ban_list_name
			ORDER BY matches DESC
		`,
            [seasonId, playerId],
        );

        return results.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (row: any) =>
                new BanListStats(
                    row.ban_list_name,
                    row.matches,
                    row.wins,
                    row.losses,
                    row.draws,
                    Math.round(row.winrate * 10) / 10,
                    null, // topMatchup not implemented yet
                ),
        );
    }

    private async getNemesis(seasonId: number, playerId: string): Promise<Nemesis | null> {
        const results = await dataSource.query(
            `
			WITH opponent_stats AS (
				SELECT
					UNNEST(string_to_array(opponent_ids, ',')) AS opponent_id,
					COUNT(*)::int AS total_matches,
					COUNT(*) FILTER (WHERE winner = true)::int AS wins,
					COUNT(*) FILTER (WHERE winner = false)::int AS losses
				FROM matches
				WHERE season = $1 
					AND user_id = $2
					AND opponent_ids IS NOT NULL
					AND anulled = false
					AND deleted_at IS NULL
				GROUP BY opponent_id
			)
			SELECT
				os.opponent_id,
				u.username AS opponent_name,
				u.avatar AS opponent_avatar,
				os.total_matches,
				os.wins,
				os.losses,
				COALESCE(
					(os.wins::float / NULLIF(os.total_matches, 0)) * 100,
					0
				) AS winrate
			FROM opponent_stats os
			INNER JOIN users u ON u.id = os.opponent_id
			WHERE u.deleted_at IS NULL
			ORDER BY os.losses DESC, os.total_matches DESC
			LIMIT 1
		`,
            [seasonId, playerId],
        );

        if (results.length === 0) {
            return null;
        }

        const nemesis = results[0];
        return new Nemesis(
            nemesis.opponent_id,
            nemesis.opponent_name,
            nemesis.opponent_avatar,
            nemesis.total_matches,
            nemesis.wins,
            nemesis.losses,
            Math.round(nemesis.winrate * 10) / 10,
        );
    }

    private async getVictim(seasonId: number, playerId: string): Promise<Nemesis | null> {
        const results = await dataSource.query(
            `
			WITH opponent_stats AS (
				SELECT
					UNNEST(string_to_array(opponent_ids, ',')) AS opponent_id,
					COUNT(*)::int AS total_matches,
					COUNT(*) FILTER (WHERE winner = true)::int AS wins,
					COUNT(*) FILTER (WHERE winner = false)::int AS losses
				FROM matches
				WHERE season = $1 
					AND user_id = $2
					AND opponent_ids IS NOT NULL
					AND anulled = false
					AND deleted_at IS NULL
				GROUP BY opponent_id
			)
			SELECT
				os.opponent_id,
				u.username AS opponent_name,
				u.avatar AS opponent_avatar,
				os.total_matches,
				os.wins,
				os.losses,
				COALESCE(
					(os.wins::float / NULLIF(os.total_matches, 0)) * 100,
					0
				) AS winrate
			FROM opponent_stats os
			INNER JOIN users u ON u.id = os.opponent_id
			WHERE u.deleted_at IS NULL
			ORDER BY os.wins DESC, os.total_matches DESC
			LIMIT 1
		`,
            [seasonId, playerId],
        );

        if (results.length === 0) {
            return null;
        }

        const victim = results[0];
        return new Nemesis(
            victim.opponent_id,
            victim.opponent_name,
            victim.opponent_avatar,
            victim.total_matches,
            victim.wins,
            victim.losses,
            Math.round(victim.winrate * 10) / 10,
        );
    }

    private async getAchievements(seasonId: number, playerId: string): Promise<Achievement[]> {
        const results = await dataSource.query(
            `
			SELECT
				a.id,
				a.name,
				a.description,
				a.icon,
				ua.unlocked_at
			FROM user_achievements ua
			INNER JOIN achievements a ON a.id = ua.achievement_id
			WHERE ua.user_id = $1
				AND ua.season = $2
			ORDER BY ua.unlocked_at DESC
		`,
            [playerId, seasonId],
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return results.map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            icon: row.icon,
            unlockedAt: row.unlocked_at,
        }));
    }

    private async getRanking(seasonId: number, playerId: string): Promise<PlayerRanking> {
        // Get total points for this player
        const playerPoints = await dataSource.query(
            `
			SELECT COALESCE(SUM(points), 0)::int AS total_points
			FROM player_stats
			WHERE user_id = $1
				AND season = $2
		`,
            [playerId, seasonId],
        );

        const points = playerPoints[0]?.total_points ?? 0;

        // Get ranking position
        const ranking = await dataSource.query(
            `
			WITH player_totals AS (
				SELECT
					user_id,
					SUM(points) AS total_points
				FROM player_stats
				WHERE season = $1
				GROUP BY user_id
			),
			ranked AS (
				SELECT
					user_id,
					total_points,
					RANK() OVER (ORDER BY total_points DESC) AS position
				FROM player_totals
			)
			SELECT
				position::int,
				(SELECT COUNT(DISTINCT user_id)::int FROM player_totals) AS total_players
			FROM ranked
			WHERE user_id = $2
		`,
            [seasonId, playerId],
        );

        if (ranking.length === 0) {
            return {
                position: 0,
                totalPlayers: 0,
                points,
                rankBadge: "Challenger",
            };
        }

        const position = ranking[0].position;
        const totalPlayers = ranking[0].total_players;

        return {
            position,
            totalPlayers,
            points,
            rankBadge: calculateRankBadge(position),
        };
    }

    private async getExtraStats(
        seasonId: number,
        playerId: string,
        banListStats: BanListStats[],
    ): Promise<ExtraStats> {
        // Most played ban list
        const mostPlayedBanList =
            banListStats.length > 0 ? banListStats[0].banListName : null;

        // Unique opponents
        const uniqueOpponents = await dataSource.query(
            `
			WITH unnested_opponents AS (
				SELECT UNNEST(string_to_array(opponent_ids, ',')) AS opponent_id
				FROM matches
				WHERE season = $1 
					AND user_id = $2
					AND opponent_ids IS NOT NULL
					AND anulled = false
					AND deleted_at IS NULL
			)
			SELECT COUNT(DISTINCT opponent_id)::int AS unique_opponents
			FROM unnested_opponents
		`,
            [seasonId, playerId],
        );

        // Best day of the week
        const bestDayResult = await dataSource.query(
            `
			SELECT
				TO_CHAR(date, 'Day') AS day_name,
				COUNT(*) FILTER (WHERE winner = true)::int AS wins,
				COUNT(*)::int AS total,
				COALESCE(
					(COUNT(*) FILTER (WHERE winner = true)::float / NULLIF(COUNT(*), 0)) * 100,
					0
				) AS winrate
			FROM matches
			WHERE season = $1 
				AND user_id = $2
				AND anulled = false
				AND deleted_at IS NULL
			GROUP BY day_name
			HAVING COUNT(*) >= 3
			ORDER BY winrate DESC, total DESC
			LIMIT 1
		`,
            [seasonId, playerId],
        );

        const bestDay = bestDayResult.length > 0 ? bestDayResult[0].day_name.trim() : null;

        return {
            mostPlayedBanList,
            uniqueOpponents: uniqueOpponents[0]?.unique_opponents ?? 0,
            bestDay,
        };
    }
}
