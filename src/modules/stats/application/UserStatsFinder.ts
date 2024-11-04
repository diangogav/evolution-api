import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class UserStatsFinder {
	constructor(private readonly repository: UserStatsRepository) {}

	async find({ banListName = "Global", userId }: { banListName: string; userId: string }): Promise<unknown> {
		const stats = await this.repository.find(userId, banListName);

		if (!stats) {
			throw new NotFoundError(`Stats for user with id ${userId} not found.`);
		}

		return stats.toJson();
	}
}
