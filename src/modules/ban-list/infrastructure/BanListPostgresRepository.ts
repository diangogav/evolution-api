import { config } from "../../../config";
import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { BanListRepository } from "../domain/BanListRepository";

export class BanListPostgresRepository implements BanListRepository {
	async get(season?: number): Promise<string[]> {
		const repository = dataSource.getRepository(PlayerStatsEntity);

		const banListNames = await repository
			.createQueryBuilder()
			.select("ban_list_name")
			.where("season = :season", { season: season ?? config.season })
			.groupBy("ban_list_name")
			.orderBy("ban_list_name", "ASC")
			.getRawMany();

		return banListNames.map((item) => item.ban_list_name);
	}
}
