import { RankMemberPattern, RankMemberPatterns } from "../../../shared/ranks/RankMemberPatterns";
import { RatingSummary } from "./UserStats";

export type RankedRating = {
	rankId: string;
	rating: RatingSummary;
};

export class RatingMembers {
	/**
	 * Fills `members` on every group rating with the ban list ratings of the same
	 * list whose name matches one of that group's patterns, preserving their order.
	 * Ratings that are not groups are returned untouched, without a `members` key.
	 */
	static attach(ratings: RankedRating[], patterns: RankMemberPattern[]): RatingSummary[] {
		const patternsByRankId = RankMemberPatterns.byRankId(patterns);
		const banListNames = ratings
			.filter(({ rating }) => rating.rankType === "banlist")
			.map(({ rating }) => rating.banListName);

		return ratings.map(({ rankId, rating }) => {
			if (rating.rankType !== "group") {
				return rating;
			}

			const groupPatterns = patternsByRankId.get(rankId) ?? [];

			return {
				...rating,
				members: banListNames.filter((banListName) =>
					groupPatterns.some((pattern) => RankMemberPatterns.matches(pattern, banListName)),
				),
			};
		});
	}
}
