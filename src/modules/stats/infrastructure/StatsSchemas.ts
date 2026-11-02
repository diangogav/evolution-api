import { t } from "elysia";

// The `tier` object on profile ratings and leaderboard rows. It mirrors the tiers
// module's TierViewSchema instead of importing that module's infrastructure; a test in
// StatsSchemas.test.ts fails if the two ever differ.
const TierIdSchema = t.Union([
	t.Literal("rookie"),
	t.Literal("bronze"),
	t.Literal("silver"),
	t.Literal("gold"),
	t.Literal("platinum"),
	t.Literal("diamond"),
	t.Literal("master"),
]);

export const StatsTierViewSchema = t.Object({
	id: TierIdSchema,
	name: t.String(),
	effectivePoints: t.Number(),
	gamesPlayed: t.Number(),
	progress: t.Nullable(
		t.Object({
			nextTierId: TierIdSchema,
			unit: t.Union([t.Literal("games"), t.Literal("points")]),
			current: t.Number(),
			target: t.Number(),
			distinctOpponentWins: t.Nullable(t.Object({ current: t.Number(), required: t.Number() })),
		}),
	),
	rating: t.Optional(t.Number()),
	peak: t.Optional(t.Number()),
});

/** A bigint column produced by a SQL window or aggregate function. */
const decimalString = (description: string, { signed = false } = {}) =>
	t.String({
		pattern: signed ? "^-?[0-9]+$" : "^[0-9]+$",
		description: `${description}, as a decimal string`,
	});

const RankTypeSchema = t.Union([t.Literal("banlist"), t.Literal("group"), t.Literal("global")]);

export const UserAchievementSchema = t.Object({
	id: t.Number(),
	icon: t.String(),
	name: t.String(),
	labels: t.Array(t.String()),
	unlockedAt: t.String({ description: "ISO 8601 timestamp" }),
	description: t.String(),
	earnedPoints: t.Number(),
	code: t.Nullable(
		t.String({ description: "Stable key of a gameplay achievement; null for tournament trophies" }),
	),
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
		t.Object({ ...RatingSummarySchema.properties, tier: t.Nullable(StatsTierViewSchema) }),
	),
});

export const LeaderboardRowSchema = t.Object({
	...userStatsFields,
	ratings: t.Array(RatingSummarySchema),
	tier: t.Nullable(StatsTierViewSchema),
});

/** Response of GET /stats: a bare array of rows, without pagination metadata. */
export const LeaderboardSchema = t.Array(LeaderboardRowSchema);

export const PeriodUserStatsSchema = t.Object({
	userId: t.String(),
	username: t.String(),
	// Mirrors the pg wire format: bigint columns arrive as strings.
	points: decimalString("Net points summed over the week, negative when losses outweigh wins", {
		signed: true,
	}),
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
