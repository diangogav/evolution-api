import { config } from "src/config";

import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UserStatsRepository } from "../domain/UserStatsRepository";
import { TierLookup } from "./TierLookup";

export class UserStatsFinder {
	constructor(
		private readonly repository: UserStatsRepository,
		private readonly tierLookup: TierLookup,
	) {}

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

		const json = stats.toJson();
		const tiers = await this.tierLookup.forPlayer({
			userId,
			season,
			rankNames: json.ratings.map((rating) => rating.banListName),
		});

		return {
			...json,
			ratings: json.ratings.map((rating) => ({
				...rating,
				tier: tiers.get(rating.banListName) ?? null,
			})),
		};
	}
}
