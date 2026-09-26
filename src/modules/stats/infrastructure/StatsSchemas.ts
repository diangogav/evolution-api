import { t } from "elysia";

import { TierViewSchema } from "../../tiers/infrastructure/TierSchemas";

/** A bigint column produced by a SQL window or aggregate function. */
const decimalString = (description: string) =>
	t.String({ pattern: "^[0-9]+$", description: `${description}, as a decimal string` });

const RankTypeSchema = t.Union([t.Literal("banlist"), t.Literal("group"), t.Literal("global")]);

export const UserAchievementSchema = t.Object({
	id: t.Number(),
	icon: t.String(),
	name: t.String(),
	labels: t.Array(t.String()),
	unlockedAt: t.String({ description: "ISO 8601 timestamp" }),
	description: t.String(),
	earnedPoints: t.Number(),
});

export const RatingSummarySchema = t.Object({
	banListName: t.String(),
	rating: t.Number(),
	gamesPlayed: t.Number(),
	peak: t.Number(),
	provisional: t.Boolean(),
	rankType: RankTypeSchema,
	members: t.Optional(
		t.Array(t.String(), { description: "Ban list ladders nested under a group entry" }),
	),
});

/** Fields of `UserStats.toJson()`, shared by the profile and the leaderboard rows. */
const userStatsFields = {
	userId: t.String(),
	username: t.String(),
	points: t.Number(),
	wins: t.Number(),
	losses: t.Number(),
	// Mirrors the pg wire format: a float8 column, null when the player has no decided game.
	winRate: t.Nullable(t.Number({ description: "Percentage of games won, 0-100" })),
	// Mirrors the pg wire format: bigint columns arrive as strings.
	position: decimalString("Rank from a SQL window function"),
	achievements: t.Array(UserAchievementSchema),
	rating: t.Optional(t.Nullable(t.Number())),
	peak: t.Optional(t.Nullable(t.Number())),
	provisional: t.Optional(t.Nullable(t.Boolean())),
};

/** Response of GET /users/:userId/stats: each rating carries its tier, null for untiered ranks. */
export const UserStatsSchema = t.Object({
	...userStatsFields,
	ratings: t.Array(
		t.Object({ ...RatingSummarySchema.properties, tier: t.Nullable(TierViewSchema) }),
	),
});

export const LeaderboardRowSchema = t.Object({
	...userStatsFields,
	ratings: t.Array(RatingSummarySchema),
	tier: t.Nullable(TierViewSchema),
});

/** Response of GET /stats: a bare array of rows, without pagination metadata. */
export const LeaderboardSchema = t.Array(LeaderboardRowSchema);

export const PeriodUserStatsSchema = t.Object({
	userId: t.String(),
	username: t.String(),
	// Mirrors the pg wire format: bigint columns arrive as strings.
	points: decimalString("Points summed over the week"),
	// Mirrors the pg wire format: bigint columns arrive as strings.
	wins: decimalString("Wins counted over the week"),
	// Mirrors the pg wire format: bigint columns arrive as strings.
	losses: decimalString("Losses counted over the week"),
	from: t.String({ description: "Start of the week" }),
	to: t.String({ description: "End of the week" }),
});

/** Response of GET /stats/player-of-the-week: every player tied for first, empty when none played. */
export const PlayerOfTheWeekSchema = t.Array(PeriodUserStatsSchema);

/** Response of GET /historical-stats. */
export const GlobalStatsResponseSchema = t.Object({
	stats: t.Object({
		totalDuels: t.Number(),
		activeBanLists: t.Number(),
		avgDuelsPerBanList: t.Number(),
	}),
	historical: t.Array(t.Object({ name: t.String(), value: t.Number() })),
	banListBreakdown: t.Array(
		t.Object({
			banListName: t.String(),
			totalDuels: t.Number(),
			percentage: t.Number(),
			popularity: t.Number({ description: "0-100 scale for UI" }),
		}),
	),
	dailyDuels: t.Array(t.Object({ date: t.String(), banListName: t.String(), count: t.Number() })),
});
