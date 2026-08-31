import { config } from "../../../config";
import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { RankMemberEntity } from "../../../evolution-types/src/entities/RankMemberEntity";
import { BanListGrouper } from "../domain/BanListGrouper";
import { BanListRepository } from "../domain/BanListRepository";
import { BanListSection, RankMemberPattern, RankSummary } from "../domain/BanListSection";

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

	async getGrouped(season?: number): Promise<BanListSection[]> {
		const ranks = await this.playedRanks(season ?? config.season);
		const patterns = await this.groupPatterns();

		return BanListGrouper.group(ranks, patterns);
	}

	private async playedRanks(season: number): Promise<RankSummary[]> {
		return dataSource
			.getRepository(PlayerStatsEntity)
			.createQueryBuilder("player_stats")
			.select("ranks.id", "id")
			.addSelect("ranks.name", "name")
			.addSelect("ranks.type", "type")
			.innerJoin("ranks", "ranks", "ranks.id = player_stats.rank_id")
			.where("player_stats.season = :season", { season })
			.andWhere("ranks.enabled = true")
			.groupBy("ranks.id")
			.addGroupBy("ranks.name")
			.addGroupBy("ranks.type")
			.orderBy("ranks.name", "ASC")
			.getRawMany();
	}

	private async groupPatterns(): Promise<RankMemberPattern[]> {
		return dataSource
			.getRepository(RankMemberEntity)
			.createQueryBuilder("rank_members")
			.select("rank_members.rank_id", "rankId")
			.addSelect("rank_members.pattern", "pattern")
			.innerJoin("ranks", "ranks", "ranks.id = rank_members.rank_id")
			.where("ranks.enabled = true")
			.andWhere("ranks.type = :type", { type: "group" })
			.getRawMany();
	}
}
