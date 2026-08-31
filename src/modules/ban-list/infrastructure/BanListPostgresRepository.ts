import { config } from "../../../config";
import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { BanListRepository } from "../domain/BanListRepository";

export class BanListPostgresRepository implements BanListRepository {
	async get(season?: number): Promise<string[]> {
		const repository = dataSource.getRepository(PlayerStatsEntity);

		const banListNames = await repository
			.createQueryBuilder("player_stats")
			.select("ranks.name", "name")
			.innerJoin("ranks", "ranks", "ranks.id = player_stats.rank_id")
			.where("player_stats.season = :season", { season: season ?? config.season })
			.andWhere("ranks.enabled = true")
			.groupBy("ranks.name")
			.orderBy("ranks.name", "ASC")
			.getRawMany();

		return banListNames.map((item) => item.name);
	}
}
