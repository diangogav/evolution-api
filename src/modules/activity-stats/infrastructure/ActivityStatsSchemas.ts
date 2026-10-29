import { t } from "elysia";

const isoTimestamp = (description: string) =>
	t.String({ description: `${description} (ISO 8601, UTC)` });

const count = (description: string) => t.Integer({ minimum: 0, description });

export const ActivityPeriodSchema = t.Union(
	[t.Literal("day"), t.Literal("week"), t.Literal("month")],
	{
		description: "Bucket size; buckets are UTC and weeks start on Monday",
	},
);

export const ActivityStatsSchema = t.Object({
	period: ActivityPeriodSchema,
	from: isoTimestamp("Start of the first bucket, inclusive"),
	to: isoTimestamp("End of the current bucket, exclusive"),
	buckets: t.Array(
		t.Object({
			start: isoTimestamp("Bucket start"),
			newUsers: count("Accounts created in the bucket and not deleted"),
			activePlayers: count("Distinct users who played at least one ranked or unranked match"),
			rankedMatches: count("Ranked games that are not annulled or deleted"),
			unrankedMatches: count("Unranked matches"),
			evoduelRankedMatches: count("Ranked games with at least one EvoDuel player"),
			evoduelUnrankedMatches: count("Unranked matches with at least one EvoDuel player"),
		}),
		{ description: "One entry per bucket, ascending, zero-filled" },
	),
	byBanList: t.Array(
		t.Object({
			start: isoTimestamp("Bucket start"),
			banListName: t.String(),
			rankedMatches: count("Ranked games on this ban list"),
			unrankedMatches: count("Unranked matches on this ban list"),
		}),
		{ description: "Ban lists with at least one match, ascending by bucket, busiest first" },
	),
});
