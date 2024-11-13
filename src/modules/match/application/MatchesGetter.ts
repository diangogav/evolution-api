import { Match } from "../domain/Match";
import { MatchRepository } from "../domain/MatchRepository";

export class MatchesGetter {
	constructor(private readonly repository: MatchRepository) {}

	async get({
		userId,
		banListName,
		limit = 100,
		page = 1,
		season,
	}: {
		userId: string;
		banListName?: string;
		limit: number;
		page: number;
		season: number;
	}): Promise<Match[]> {
		return this.repository.get({ userId, banListName, limit, page, season });
	}
}
