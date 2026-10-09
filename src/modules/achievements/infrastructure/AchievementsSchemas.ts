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
