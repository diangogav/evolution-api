import { dataSource } from "../../../evolution-types/src/data-source";
import { UserStats } from "../domain/UserStats";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsPostgresRepository implements UserStatsRepository {
	async find(userId: string, banListName: string): Promise<UserStats | null> {
		const response = await dataSource.query(
			`
            WITH RankedPlayers AS (
                SELECT 
                    id,
                    user_id,
                    points,
                    wins,
                    losses,
                    ban_list_name as banListName,
                    (wins::float / NULLIF(wins + losses, 0)) * 100 AS "win_rate",
                    RANK() OVER (ORDER BY points DESC, (wins::float / NULLIF(wins + losses, 0)) DESC) AS "position"
                FROM 
                    player_stats
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
}
