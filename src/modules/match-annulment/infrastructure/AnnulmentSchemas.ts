import { t, type TSchema } from "elysia";

const annulOutcome = t.Union([
	t.Literal("annulled"),
	t.Literal("already"),
	t.Literal("not-found"),
	t.Literal("conflict"),
	t.Literal("partial"),
]);

const unannulOutcome = t.Union([
	t.Literal("un-annulled"),
	t.Literal("not-annulled"),
	t.Literal("not-found"),
	t.Literal("conflict"),
	t.Literal("partial"),
]);

// Shared per-game shape both batch use cases return; `reason` is set only for
// `conflict`, `error` only for `partial`.
const gameOutcomeResult = <T extends TSchema>(outcome: T) =>
	t.Object({
		gameId: t.String(),
		outcome,
		pointsRows: t.Number(),
		eloReversed: t.Number(),
		eloSkipped: t.Number(),
		eloReinstated: t.Number(),
		reason: t.Optional(t.String()),
		error: t.Optional(t.String()),
	});

/** Per-game result of POST /admin/matches/annulments. */
export const AnnulGameResultSchema = gameOutcomeResult(annulOutcome);

/** Response of POST /admin/matches/annulments. */
export const AnnulMatchesResultSchema = t.Object({
	results: t.Array(AnnulGameResultSchema),
	totals: t.Object({ eloReversed: t.Number(), eloSkipped: t.Number() }),
});

/** Per-game result of POST /admin/matches/annulments/reversals. */
export const UnannulGameResultSchema = gameOutcomeResult(unannulOutcome);

/** Response of POST /admin/matches/annulments/reversals. */
export const UnannulMatchesResultSchema = t.Object({
	results: t.Array(UnannulGameResultSchema),
	totals: t.Object({ eloReinstated: t.Number(), eloSkipped: t.Number() }),
});
