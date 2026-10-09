import { t } from "elysia";

export const AchievementRequirementSchema = t.Object({
	metric: t.Union([
		t.Literal("rankedWins"),
		t.Literal("rankedMatches"),
		t.Literal("currentStreak"),
		t.Literal("ladderFirstWin"),
	]),
	target: t.Number({ description: "Counter value (or 1 for a first win) that unlocks the award" }),
	ladder: t.Optional(t.String({ description: "Format ladder of a ladderFirstWin requirement" })),
});

export const AchievementCatalogSchema = t.Object({
	version: t.String({ description: "Stable digest of the catalog; also sent as the ETag" }),
	items: t.Array(
		t.Object({
			id: t.Number(),
			code: t.String({ description: "Stable key of the gameplay achievement" }),
			icon: t.String(),
			name: t.String(),
			description: t.String(),
			earnedPoints: t.Number(),
			requirement: t.Nullable(AchievementRequirementSchema, {
				description: "Null when the code is not one this API can measure",
			}),
		}),
	),
});

const LadderFlagsSchema = t.Object({
	TCG: t.Boolean(),
	OCG: t.Boolean(),
	Edison: t.Boolean(),
	JTP: t.Boolean(),
	Genesys: t.Boolean(),
});

export const UserAchievementRecordSchema = t.Object({
	userId: t.String(),
	asOf: t.String({ description: "ISO 8601 timestamp of the progress snapshot" }),
	scope: t.Literal("lifetime-ranked"),
	achievements: t.Array(
		t.Object({
			awardId: t.String({ description: "Identity of this award (user_achievements.id)" }),
			id: t.Number({ description: "Catalog id of the achievement" }),
			code: t.Nullable(
				t.String({
					description: "Stable key of a gameplay achievement; null for tournament trophies",
				}),
			),
			icon: t.String(),
			name: t.String(),
			description: t.String(),
			labels: t.Array(t.String()),
			unlockedAt: t.String({ description: "ISO 8601 timestamp" }),
			season: t.Number(),
			earnedPoints: t.Number(),
		}),
	),
	progress: t.Object({
		rankedWins: t.Number({ description: "Lifetime ranked wins" }),
		rankedMatches: t.Number({ description: "Lifetime ranked matches" }),
		currentStreak: t.Number({ description: "Consecutive ranked wins since the last loss" }),
		hasRankedWinByLadder: LadderFlagsSchema,
	}),
});
