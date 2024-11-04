import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { Leaderboard } from "../domain/Leaderboard";
import { LeaderboardRepository } from "../domain/LeaderboardRepository";

export class LeaderboardPostgresRepository implements LeaderboardRepository {
	async get({
		page,
		limit,
		banListName,
	}: {
		page: number;
		limit: number;
		banListName: string;
	}): Promise<Leaderboard[]> {
		const repository = dataSource.getRepository(PlayerStatsEntity);

		const leaderboard = await repository
			.createQueryBuilder("player_stats")
			.innerJoin(UserProfileEntity, "users", "player_stats.userId = users.id")
			.select([
				"users.id as userId",
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

		return leaderboard.map((item) => Leaderboard.from({ ...item, userId: item.userid, winRate: item.winrate }));
	}
}
