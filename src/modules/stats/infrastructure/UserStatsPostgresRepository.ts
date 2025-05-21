import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { PeriodUserStats } from "../domain/PeriodUserStats";
import { UserStats } from "../domain/UserStats";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsPostgresRepository implements UserStatsRepository {
	async find(userId: string, banListName: string, season: number, label?: string): Promise<UserStats | null> {
		const subQuery = dataSource
			.createQueryBuilder()
			.select([
				"users.username AS username",
				"player_stats.user_id AS user_id",
				"player_stats.points AS points",
				"player_stats.wins AS wins",
				"player_stats.losses AS losses",
				"player_stats.ban_list_name AS banListName",
				"(player_stats.wins::float / NULLIF(player_stats.wins + player_stats.losses, 0)) * 100 AS win_rate",
				"RANK() OVER (ORDER BY player_stats.points DESC, (player_stats.wins::float / NULLIF(player_stats.wins + player_stats.losses, 0)) DESC) AS position",
			])
			.from(PlayerStatsEntity, "player_stats")
			.innerJoin("users", "users", "users.id = player_stats.user_id")
			.where("player_stats.ban_list_name = :banListName", { banListName })
			.andWhere("player_stats.season = :season", { season });

		const response = await dataSource
			.createQueryBuilder()
			.select([
				"rp.*",
				`COALESCE(
								jsonb_agg(
										CASE
												WHEN a.id IS NOT NULL AND (:label::jsonb IS NULL OR ua.labels::jsonb @> :label::jsonb) THEN jsonb_build_object(
														'id', a.id,
														'name', a.name,
														'description', a.description,
														'icon', a.icon,
														'earnedPoints', a.earned_points,
														'unlockedAt', ua.unlocked_at,
														'labels', ua.labels
												)
										END
								) FILTER (WHERE a.id IS NOT NULL AND (:label::jsonb IS NULL OR ua.labels::jsonb @> :label::jsonb)), '[]'::jsonb
						) AS achievements`,
			])
			.from(`(${subQuery.getQuery()})`, "rp")
			.leftJoin("user_achievements", "ua", "ua.user_id = rp.user_id")
			.leftJoin("achievements", "a", "a.id = ua.achievement_id")
			.where("rp.user_id = :userId", { userId })
			.groupBy("rp.username, rp.user_id, rp.points, rp.wins, rp.losses, rp.banListName, rp.win_rate, rp.position")
			.setParameters({
				...subQuery.getParameters(),
				label: label ? JSON.stringify([label]) : null,
			})
			.getRawOne();

		if (!response) {
			return null;
		}

		return UserStats.from({ ...response, userId: response.user_id, winRate: response.win_rate });
	}

	async leaderboard({
		page,
		limit,
		banListName,
		season,
	}: {
		page: number;
		limit: number;
		banListName: string;
		season: number;
	}): Promise<UserStats[]> {
		const leaderboard = await dataSource
			.createQueryBuilder()
			.select([
				"users.id AS userId",
				"users.username AS username",
				"player_stats.points AS points",
				"player_stats.wins AS wins",
				"player_stats.losses AS losses",
				"player_stats.ban_list_name AS banListName",
				"(player_stats.wins::FLOAT / NULLIF(player_stats.losses + player_stats.wins, 0)) * 100 AS winRate",
				"ROW_NUMBER() OVER (ORDER BY player_stats.points DESC, ((player_stats.wins::FLOAT / NULLIF(player_stats.losses + player_stats.wins, 0)) * 100) DESC) AS position",
				`COALESCE(
                jsonb_agg(
                    CASE
                        WHEN a.id IS NOT NULL THEN jsonb_build_object(
                            'id', a.id,
                            'name', a.name,
                            'description', a.description,
                            'icon', a.icon,
                            'earnedPoints', a.earned_points,
                            'unlockedAt', ua.unlocked_at,
                            'labels', ua.labels
                        )
                    END
                ) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb
            ) AS achievements`,
			])
			.from(PlayerStatsEntity, "player_stats")
			.innerJoin(UserProfileEntity, "users", "player_stats.userId = users.id")
			.leftJoin("user_achievements", "ua", "ua.user_id = users.id")
			.leftJoin("achievements", "a", "a.id = ua.achievement_id")
			.where("player_stats.ban_list_name = :banListName", { banListName })
			.andWhere("player_stats.season = :season", { season })
			.groupBy(
				"users.id, users.username, player_stats.points, player_stats.wins, player_stats.losses, player_stats.ban_list_name",
			)
			.orderBy("player_stats.points", "DESC")
			.addOrderBy("winRate", "DESC")
			.offset((page - 1) * limit)
			.limit(limit)
			.setParameters({ banListName })
			.getRawMany();

		return leaderboard.map((item) => UserStats.from({ ...item, userId: item.userid, winRate: item.winrate }));
	}

	async getBestPlayerOfLastCompletedWeek(): Promise<PeriodUserStats[]> {
		const response = await dataSource.query(`
			WITH current_utc AS (
				SELECT NOW() AT TIME ZONE 'UTC' AS now_utc
			),
			last_sunday AS (
				SELECT DATE_TRUNC('week', now_utc)::date AS this_sunday
				FROM current_utc
			),
			target_week AS (
				SELECT
					this_sunday - INTERVAL '7 days' AS week_start,
					this_sunday - INTERVAL '1 day'  AS week_end
				FROM last_sunday
			),
			week_matches AS (
				SELECT
					user_id,
					DATE_TRUNC('week', date AT TIME ZONE 'UTC')::date AS match_week,
					SUM(points) AS total_points,
					COUNT(*) FILTER (WHERE winner = true) AS wins,
					COUNT(*) FILTER (WHERE winner = false) AS losses
				FROM matches
				GROUP BY user_id, match_week
			),
			filtered_matches AS (
				SELECT
					wm.user_id,
					tw.week_start,
					tw.week_end,
					wm.total_points,
					wm.wins,
					wm.losses
				FROM week_matches wm
				JOIN target_week tw ON wm.match_week = tw.week_start
			),
			ranked AS (
				SELECT *,
					DENSE_RANK() OVER (ORDER BY total_points DESC) AS rank
				FROM filtered_matches
			)
			SELECT
				r.user_id,
				u.username,
				r.week_start,
				r.week_end,
				r.total_points,
				r.wins,
				r.losses
			FROM ranked r
			JOIN users u ON u.id = r.user_id
			WHERE r.rank = 1;
		`);

		return response.map((item) => PeriodUserStats.from({
			userId: item?.user_id,
			username: item?.username,
			points: item?.total_points,
			wins: item?.wins,
			losses: item?.losses,
			from: item?.week_start,
			to: item?.week_end
		}));

	}

}
