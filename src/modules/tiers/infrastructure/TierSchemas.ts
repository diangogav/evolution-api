import { t } from "elysia";

export const TierIdSchema = t.Union([
	t.Literal("rookie"),
	t.Literal("bronze"),
	t.Literal("silver"),
	t.Literal("gold"),
	t.Literal("platinum"),
	t.Literal("diamond"),
	t.Literal("master"),
]);

export const TierProgressSchema = t.Object({
	nextTierId: TierIdSchema,
	unit: t.Union([t.Literal("games"), t.Literal("points")]),
	current: t.Number(),
	target: t.Number(),
	distinctOpponentWins: t.Nullable(t.Object({ current: t.Number(), required: t.Number() })),
});

/** The additive `tier` object on profile ratings and leaderboard rows. */
export const TierViewSchema = t.Object({
	id: TierIdSchema,
	name: t.String(),
	effectivePoints: t.Number(),
	gamesPlayed: t.Number(),
	progress: t.Nullable(TierProgressSchema),
	rating: t.Optional(t.Number()),
	peak: t.Optional(t.Number()),
});

export const TierDefinitionSchema = t.Object({
	id: TierIdSchema,
	name: t.String(),
	order: t.Number(),
	kind: t.Union([t.Literal("placement"), t.Literal("absolute"), t.Literal("relative")]),
	icon: t.String(),
	threshold: t.Nullable(t.Number()),
	minGames: t.Nullable(t.Number()),
	distinctOpponentWins: t.Nullable(t.Number()),
	requiresTier: t.Nullable(TierIdSchema),
	size: t.Nullable(t.Number()),
});

/** Response of GET /ranked-tiers. */
export const RankedTierCatalogSchema = t.Object({
	banListName: t.Nullable(t.String()),
	dailyOpponentCap: t.Number(),
	dayBoundary: t.Literal("UTC"),
	tiers: t.Array(TierDefinitionSchema),
});
