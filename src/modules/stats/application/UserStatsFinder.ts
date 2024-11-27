import { config } from "src/config";

import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsFinder {
	constructor(private readonly repository: UserStatsRepository) {}

	async find({
		banListName = "Global",
		userId,
		season = config.season,
	}: {
		banListName?: string;
		userId: string;
		season: number;
	}): Promise<unknown> {
		const stats = await this.repository.find(userId, banListName, season);

		if (!stats) {
			throw new NotFoundError(`Stats for user with id ${userId} not found.`);
		}

		return stats.toJson();
	}
}
