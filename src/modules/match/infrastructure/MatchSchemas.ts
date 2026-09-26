import { t } from "elysia";

/** Public fields of a `Match` as JSON serializes them. */
export const MatchSchema = t.Object({
	userId: t.String(),
	bestOf: t.Number(),
	banListName: t.String(),
	playerNames: t.Array(t.String(), { description: "The user and any tag partners" }),
	opponentNames: t.Array(t.String()),
	playerScore: t.Number(),
	opponentScore: t.Number(),
	points: t.Number({ description: "Points won or lost, negative for a loss" }),
	winner: t.Boolean(),
	// A timestamp column read as a Date, which JSON serializes as an ISO string.
	date: t.String({ description: "ISO 8601 timestamp" }),
	season: t.Number(),
	anulled: t.Boolean({ description: "True when an admin annulled the match" }),
	anulledReason: t.Nullable(t.String()),
});

/** Response of GET /users/:userId/matches: a bare array, newest first, without pagination metadata. */
export const UserMatchesSchema = t.Array(MatchSchema);
