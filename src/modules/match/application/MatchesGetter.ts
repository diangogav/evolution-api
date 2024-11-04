import { Match } from "../domain/Match";
import { MatchRepository } from "../domain/MatchRepository";

export class MatchesGetter {
	constructor(private readonly repository: MatchRepository) {}

	async get({
		userId,
		banListName,
		limit = 100,
		page = 1,
	}: {
		userId: string;
		banListName?: string;
		limit: number;
		page: number;
	}): Promise<Match[]> {
		return this.repository.get({ userId, banListName, limit, page });
	}
}
