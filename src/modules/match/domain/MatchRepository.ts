import { Match } from "./Match";

export interface MatchRepository {
	get({
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
	}): Promise<Match[]>;
}
