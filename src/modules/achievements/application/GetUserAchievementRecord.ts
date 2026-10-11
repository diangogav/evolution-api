import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { currentStreak } from "../domain/currentStreak";
import { Ladder, ladderWins } from "../domain/ladderWins";
import { UserAchievementRecordRepository } from "../domain/UserAchievementRecordRepository";

export type UserAchievementRecord = {
	userId: string;
	asOf: string;
	scope: "lifetime-ranked";
	achievements: Array<{
		awardId: string;
		id: number;
		code: string | null;
		icon: string;
		name: string;
		description: string;
		labels: string[];
		unlockedAt: string;
		season: number;
		earnedPoints: number;
	}>;
	progress: {
		rankedWins: number;
		rankedMatches: number;
		currentStreak: number;
		hasRankedWinByLadder: Record<Ladder, boolean>;
	};
};

export class GetUserAchievementRecord {
	constructor(
		private readonly repository: UserAchievementRecordRepository,
		private readonly now: () => Date = () => new Date(),
	) {}

	async run(userId: string): Promise<UserAchievementRecord> {
		if (!(await this.repository.userExists(userId))) {
			throw new NotFoundError(`User with id ${userId} not found.`);
		}

		const [awards, totals, winningBanLists, outcomes, groups] = await Promise.all([
			this.repository.findAwards(userId),
			this.repository.findTotals(userId),
			this.repository.findWinningBanLists(userId),
			this.repository.findLatestOutcomes(userId),
			this.repository.findLadderGroups(),
		]);

		return {
			userId,
			asOf: this.now().toISOString(),
			scope: "lifetime-ranked",
			achievements: awards.map((award) => ({
				...award,
				unlockedAt: award.unlockedAt.toISOString(),
			})),
			progress: {
				rankedWins: totals.rankedWins,
				rankedMatches: totals.rankedMatches,
				currentStreak: currentStreak(outcomes),
				hasRankedWinByLadder: ladderWins(winningBanLists, groups),
			},
		};
	}
}
