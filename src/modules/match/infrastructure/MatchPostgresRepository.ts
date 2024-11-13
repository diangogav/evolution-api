import { dataSource } from "../../../evolution-types/src/data-source";
import { MatchResumeEntity } from "../../../evolution-types/src/entities/MatchResumeEntity";
import { Match } from "../domain/Match";
import { MatchRepository } from "../domain/MatchRepository";

export class MatchPostgresRepository implements MatchRepository {
	async get({
		userId,
		banListName,
		limit,
		page,
		season,
	}: {
		userId: string;
		banListName?: string;
		limit: number;
		page: number;
		season: number;
	}): Promise<Match[]> {
		const repository = dataSource.getRepository(MatchResumeEntity);

		const queryBuilder = repository
			.createQueryBuilder("match_resume")
			.where("match_resume.userId = :userId", { userId })
			.andWhere("match_resume.season = :season", { season })
			.orderBy("match_resume.date", "DESC")
			.offset((page - 1) * limit)
			.limit(limit);

		if (banListName) {
			queryBuilder.andWhere("match_resume.banListName = :banListName", { banListName });
		}

		const matches = await queryBuilder.getMany();

		return matches.map((match) => Match.from(match));
	}
}
