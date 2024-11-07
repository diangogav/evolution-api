import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { UserStats } from "../domain/UserStats";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsPostgresRepository implements UserStatsRepository {
	async find(userId: string, banListName: string): Promise<UserStats | null> {
		const response = await dataSource.query(
			`
            WITH RankedPlayers AS (
                SELECT 
                    username,
                    user_id,
                    points,
                    wins,
                    losses,
                    ban_list_name as banListName,
                    (wins::float / NULLIF(wins + losses, 0)) * 100 AS "win_rate",
                    RANK() OVER (ORDER BY points DESC, (wins::float / NULLIF(wins + losses, 0)) DESC) AS "position"
                FROM 
                    player_stats
                INNER JOIN users ON 
                	users.id = player_stats.user_id
                WHERE 
                    ban_list_name = $2
            )
            SELECT *
            FROM RankedPlayers
            WHERE user_id = $1;
        `,
			[userId, banListName],
		);

		if (!response[0]) {
			return null;
		}

		const data = response[0];

		return UserStats.from({ ...response[0], userId: data.user_id, winRate: data.win_rate });
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
		const repository = dataSource.getRepository(PlayerStatsEntity);

		const leaderboard = await repository
			.createQueryBuilder("player_stats")
			.innerJoin(UserProfileEntity, "users", "player_stats.userId = users.id")
			.select([
				"users.id as userId",
				"users.username as username",
				"player_stats.points AS points",
				"player_stats.wins AS wins",
				"player_stats.losses AS losses",
				"users.username AS username",
				"(player_stats.wins::FLOAT / NULLIF(player_stats.losses + player_stats.wins, 0)) * 100 as winRate",
				"ROW_NUMBER() OVER (ORDER BY player_stats.points DESC, ((player_stats.wins::FLOAT / NULLIF(player_stats.losses + player_stats.wins, 0)) * 100) DESC) as position",
			])
			.where("player_stats.ban_list_name = :banListName", { banListName })
			.orderBy("player_stats.points", "DESC")
			.addOrderBy("winRate", "DESC")
			.offset((page - 1) * limit)
			.limit(limit)
			.getRawMany();

		return leaderboard.map((item) => UserStats.from({ ...item, userId: item.userid, winRate: item.winrate }));
	}
}
