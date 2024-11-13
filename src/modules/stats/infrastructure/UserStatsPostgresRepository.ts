import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { UserStats } from "../domain/UserStats";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsPostgresRepository implements UserStatsRepository {
	async find(userId: string, banListName: string, label?: string): Promise<UserStats | null> {
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
			.where("player_stats.ban_list_name = :banListName", { banListName });

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
	}: {
		page: number;
		limit: number;
		banListName: string;
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
}
