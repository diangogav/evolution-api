import { dataSource } from "../../../evolution-types/src/data-source";
import { MatchResumeEntity } from "../../../evolution-types/src/entities/MatchResumeEntity";
import { RankMemberPatterns } from "../../../shared/ranks/RankMemberPatterns";
import { Match } from "../domain/Match";
import { MatchBanListFilter, MatchBanListFilters, RankType } from "../domain/MatchBanListFilter";
import { MatchRepository } from "../domain/MatchRepository";

const LIKE_WILDCARDS = /[\\%_]/g;

type BanListQueryBuilder = {
	andWhere(condition: string, parameters?: Record<string, unknown>): unknown;
};

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
			this.applyBanListFilter(queryBuilder, await this.banListFilter(banListName));
		}

		const matches = await queryBuilder.getMany();

		return matches.map((match) => Match.from(match));
	}

	private async banListFilter(banListName: string): Promise<MatchBanListFilter> {
		const rows: { type: RankType; pattern: string | null }[] = await dataSource.query(
			`SELECT ranks.type AS "type", rank_members.pattern AS "pattern"
			 FROM ranks
			 LEFT JOIN rank_members ON rank_members.rank_id = ranks.id
			 WHERE ranks.name = $1`,
			[banListName],
		);

		const [rank] = rows;

		if (!rank) {
			return MatchBanListFilters.resolve({ banListName, rank: null });
		}

		const patterns = rows
			.map((row) => row.pattern)
			.filter((pattern): pattern is string => pattern !== null);

		return MatchBanListFilters.resolve({ banListName, rank: { type: rank.type, patterns } });
	}

	private applyBanListFilter(queryBuilder: BanListQueryBuilder, filter: MatchBanListFilter): void {
		if (filter.type === "all") {
			return;
		}

		if (filter.type === "name") {
			queryBuilder.andWhere("match_resume.banListName = :banListName", {
				banListName: filter.banListName,
			});

			return;
		}

		if (filter.patterns.length === 0) {
			queryBuilder.andWhere("FALSE");

			return;
		}

		const parameters: Record<string, string> = {};
		const conditions = filter.patterns.map((pattern, index) => {
			const parameter = `banListPattern${index}`;
			const suffix = RankMemberPatterns.suffixOf(pattern);

			if (suffix === null) {
				parameters[parameter] = pattern;

				return `match_resume.banListName = :${parameter}`;
			}

			// The suffix is compared literally, so its own LIKE wildcards are escaped.
			parameters[parameter] = `%${suffix.replace(LIKE_WILDCARDS, (character) => `\\${character}`)}`;

			return `match_resume.banListName LIKE :${parameter}`;
		});

		queryBuilder.andWhere(`(${conditions.join(" OR ")})`, parameters);
	}
}
