import { t } from "elysia";

/**
 * Response of POST /tournaments/{tournamentId}/enroll, POST
 * /tournaments/{tournamentId}/withdraw and POST /tournaments/webhook: all
 * three answer this exact literal once the underlying operation completes,
 * regardless of what the tournaments service itself returned.
 */
export const TournamentActionSchema = t.Object({ success: t.Literal(true) });

/**
 * Response of DELETE /tournaments/{tournamentId}/matches/{matchId}/result.
 * The upstream tournaments service answers this call with 204 and no body
 * (`matches.routes.ts`), so the handler cannot relay anything from it and
 * always answers this literal message once the call succeeds.
 */
export const MatchResultAnnulledSchema = t.Object({
	message: t.Literal("Match result annulled"),
});

/**
 * One row of GET /tournaments/ranking, built from `lightning_rankings`
 * (plain integer columns, not bigint/numeric, so points and the two
 * counters travel as JSON numbers, not strings) joined to the owning user
 * profile. `user` is null when the profile relation cannot be resolved.
 */
export const TournamentRankingEntrySchema = t.Object({
	userId: t.String(),
	points: t.Number(),
	tournamentsWon: t.Number(),
	tournamentsPlayed: t.Number(),
	user: t.Union([t.Object({ username: t.String(), email: t.String() }), t.Null()]),
});

/** Response of GET /tournaments/ranking. */
export const TournamentRankingListSchema = t.Array(TournamentRankingEntrySchema);

// The schemas below document routes whose body is relayed from the
// tournaments service (github.com/diangogav/evolution-tournaments, commit
// c19746d). They are traced from that service's own route handlers and
// Prisma schema, not guessed: objects stay open (`additionalProperties:
// true`) so a later field the upstream service adds does not break this
// contract, since this API does not own or validate that shape.

const upstreamTournamentFormat = t.Union([
	t.Literal("ROUND_ROBIN"),
	t.Literal("SWISS"),
	t.Literal("SINGLE_ELIMINATION"),
	t.Literal("DOUBLE_ELIMINATION"),
]);

const upstreamTournamentStatus = t.Union([
	t.Literal("DRAFT"),
	t.Literal("PUBLISHED"),
	t.Literal("STARTED"),
	t.Literal("COMPLETED"),
	t.Literal("CANCELLED"),
]);

const upstreamParticipantType = t.Union([t.Literal("PLAYER"), t.Literal("TEAM")]);

/**
 * Shared fields of a tournament as the upstream `Tournament` entity stores
 * and returns them (`tournament.ts`, `prisma/schema.prisma`): every column
 * is nullable rather than omitted, so Prisma always answers with the key
 * present and `null` when unset.
 */
const upstreamTournamentFields = {
	id: t.String(),
	name: t.String(),
	description: t.Union([t.String(), t.Null()]),
	discipline: t.String(),
	format: upstreamTournamentFormat,
	status: upstreamTournamentStatus,
	allowMixedParticipants: t.Boolean(),
	participantType: t.Union([upstreamParticipantType, t.Null()]),
	maxParticipants: t.Union([t.Number(), t.Null()]),
	startAt: t.Union([t.String(), t.Null()]),
	endAt: t.Union([t.String(), t.Null()]),
	location: t.Union([t.String(), t.Null()]),
	metadata: t.Unknown(),
	createdAt: t.String(),
	updatedAt: t.String(),
};

/**
 * Response element of GET /tournaments/: the upstream list route returns
 * `tournament.toPresentation()`, which is every tournament field except
 * `webhookUrl` (`tournament.ts`, `tournaments.routes.ts`).
 */
export const UpstreamTournamentSummarySchema = t.Object(upstreamTournamentFields, {
	additionalProperties: true,
});

/** Response of GET /tournaments/. */
export const UpstreamTournamentListSchema = t.Array(UpstreamTournamentSummarySchema);

/**
 * Response of POST /tournaments/: `CreateTournamentProxyUseCase` casts the
 * tournaments service's reply to this API's local `Tournament` type without
 * checking it at runtime. The upstream route itself answers with
 * `tournament.toPrimitives()`, which is every tournament field including
 * `webhookUrl` (`tournament.ts`, `tournaments.routes.ts`), at HTTP 201 -
 * this API does not forward that status and always answers 200.
 */
export const CreatedTournamentSchema = t.Object(
	{
		...upstreamTournamentFields,
		webhookUrl: t.Union([t.String(), t.Null()]),
	},
	{ additionalProperties: true },
);

const upstreamBracketPositionRef = t.Object({ round: t.Number(), position: t.Number() });

const upstreamBracketParticipant = t.Object({
	id: t.String(),
	displayName: t.String(),
	score: t.Union([t.Number(), t.Null()]),
});

const upstreamBracketMatch = t.Object(
	{
		id: t.String(),
		roundNumber: t.Number(),
		position: t.Number(),
		slotId: t.String(),
		nextMatchId: t.Union([t.String(), t.Null()]),
		next: t.Union([upstreamBracketPositionRef, t.Null()]),
		from: t.Array(upstreamBracketPositionRef),
		participant1: t.Optional(upstreamBracketParticipant),
		participant2: t.Optional(upstreamBracketParticipant),
		winnerId: t.Union([t.String(), t.Null()]),
	},
	{ additionalProperties: true },
);

const upstreamBracketRound = t.Object(
	{ roundNumber: t.Number(), matches: t.Array(upstreamBracketMatch) },
	{ additionalProperties: true },
);

/**
 * Response of GET /tournaments/{tournamentId}/bracket: the upstream bracket
 * view (`bracket.dto.ts`, `view-bracket.use-case.ts`), keyed by slot rather
 * than by the match/participant shape the old hand-written example used.
 * `participant1`/`participant2` are absent for a TBD slot or an
 * unresolvable participant, never `null`.
 */
export const TournamentBracketSchema = t.Object(
	{
		tournamentId: t.String(),
		rounds: t.Array(upstreamBracketRound),
	},
	{ additionalProperties: true },
);

const upstreamTournamentEntryStatus = t.Union([
	t.Literal("PENDING"),
	t.Literal("CONFIRMED"),
	t.Literal("CANCELLED"),
	t.Literal("WITHDRAWN"),
]);

/**
 * Response element of GET /tournaments/{tournamentId}/entries: the upstream
 * route lists entries through `listByTournament`, the only repository
 * method that joins the participant and sets `participantName`
 * (`tournament-entry.repository.ts`), so this route always includes it.
 */
export const TournamentEntrySchema = t.Object(
	{
		id: t.String(),
		tournamentId: t.String(),
		participantId: t.String(),
		status: upstreamTournamentEntryStatus,
		groupId: t.Union([t.String(), t.Null()]),
		seed: t.Union([t.Number(), t.Null()]),
		metadata: t.Unknown(),
		createdAt: t.String(),
		updatedAt: t.String(),
		participantName: t.String(),
	},
	{ additionalProperties: true },
);

/** Response of GET /tournaments/{tournamentId}/entries. */
export const TournamentEntryListSchema = t.Array(TournamentEntrySchema);
