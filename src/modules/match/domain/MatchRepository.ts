import { Match } from "./Match";

export interface MatchRepository {
	get({
		userId,
		banListName,
		limit,
		page,
	}: {
		userId: string;
		banListName?: string;
		limit: number;
		page: number;
	}): Promise<Match[]>;
}
