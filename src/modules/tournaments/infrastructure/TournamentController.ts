import { Elysia, t } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { UpdateRankingUseCase } from "../application/UpdateRankingUseCase";
import { GetRankingUseCase } from "../application/GetRankingUseCase";
import {
	CreateTournamentInput,
	CreateTournamentProxyUseCase,
} from "../application/CreateTournamentProxyUseCase";
import { TournamentEnrollmentUseCase } from "../application/TournamentEnrollmentUseCase";
import { TournamentWithdrawalUseCase } from "../application/TournamentWithdrawalUseCase";
import { JWT } from "src/shared/JWT";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { ForbiddenError } from "src/shared/errors/ForbiddenError";
import { config } from "src/config";
import { errorResponse, errorResponses, jsonOk } from "src/server/openapi/responses";
import { MatchResultRequestSchema, MessageResponseSchema } from "./swagger-schemas";
import {
	CreatedTournamentSchema,
	MatchResultAnnulledSchema,
	TournamentActionSchema,
	TournamentBracketSchema,
	TournamentEntryListSchema,
	TournamentRankingListSchema,
	UpstreamTournamentListSchema,
} from "./TournamentSchemas";

const UPSTREAM_UNAVAILABLE = errorResponse("Upstream tournaments service unavailable");

export class TournamentController {
	private readonly tournamentsApiUrl: string;

	constructor(
		private readonly updateRanking: UpdateRankingUseCase,
		private readonly getRanking: GetRankingUseCase,
		private readonly createTournament: CreateTournamentProxyUseCase,
		private readonly tournamentEnrollmentUseCase: TournamentEnrollmentUseCase,
		private readonly tournamentWithdrawalUseCase: TournamentWithdrawalUseCase,
		private readonly jwt: JWT,
	) {
		this.tournamentsApiUrl = config.tournaments.apiUrl;
	}

	routes(app: Elysia) {
		return app.group("/tournaments", (app) =>
			app
				.use(bearer())
				.get(
					"/",
					async () => {
						const response = await fetch(`${this.tournamentsApiUrl}/tournaments`);

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Failed to get tournaments: ${response.status} ${text}`);
						}

						return response.json();
					},
					{
						detail: {
							tags: ["Lightning Tournaments"],
							summary: "Get all tournaments",
							description: "Retrieves a list of all tournaments from the tournaments service",
							responses: {
								200: jsonOk(UpstreamTournamentListSchema, "Tournaments retrieved successfully", [
									{
										id: "tournament-001",
										name: "Weekly Lightning",
										description: null,
										discipline: "Yu-Gi-Oh!",
										format: "SINGLE_ELIMINATION",
										status: "PUBLISHED",
										allowMixedParticipants: false,
										participantType: "PLAYER",
										maxParticipants: 8,
										startAt: "2025-11-24T11:33:08-04:00",
										endAt: null,
										location: "Online",
										metadata: { banlist: "TCG" },
										createdAt: "2025-11-20T10:00:00.000Z",
										updatedAt: "2025-11-20T10:00:00.000Z",
									},
								]),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				)
				.post(
					"/webhook",
					async ({ body }) => {
						const { tournamentId } = body as {
							tournamentId: string;
							winnerId: string;
							completedAt: string;
						};
						// Process all participants' rankings based on final positions
						await this.updateRanking.execute({ tournamentId });
						return { success: true };
					},
					{
						detail: {
							tags: ["Tournaments"],
							summary: "Tournament completion webhook",
							description:
								"Webhook endpoint called when a tournament is completed to update rankings. Not authenticated: it accepts no shared secret or signature, so anything reaching this URL can trigger a ranking update.",
							responses: {
								200: jsonOk(TournamentActionSchema, "Rankings updated successfully", {
									success: true,
								}),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
						body: t.Object({
							winnerId: t.String(),
							tournamentId: t.String(),
							completedAt: t.String(),
						}),
					},
				)
				.get(
					"/ranking",
					async ({ query }) => {
						const limit = query.limit ? parseInt(query.limit as string) : 10;
						const rankings = await this.getRanking.execute(limit);
						return rankings; // Already plain objects with user data
					},
					{
						detail: {
							tags: ["Lightning Tournaments"],
							summary: "Get lightning tournament ranking",
							description: "Retrieves the top players ranking for lightning tournaments",
							responses: {
								200: jsonOk(TournamentRankingListSchema, "Ranking retrieved successfully", [
									{
										userId: "user-1",
										points: 15,
										tournamentsWon: 2,
										tournamentsPlayed: 4,
										user: { username: "Player1", email: "player1@example.com" },
									},
								]),
							},
						},
						query: t.Object({
							limit: t.Optional(t.String()),
						}),
					},
				)
				.post(
					"/",
					async ({ body, bearer }) => {
						const { role } = this.jwt.decode(bearer as string) as { role: string };
						if (role !== UserProfileRole.ADMIN) {
							throw new ForbiddenError("You do not have permission to create tournaments");
						}
						const tournament = await this.createTournament.execute(body as CreateTournamentInput);
						return tournament;
					},
					{
						detail: {
							tags: ["Lightning Tournaments"],
							summary: "Create lightning tournament",
							description: "Creates a new lightning tournament. Requires admin privileges.",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(CreatedTournamentSchema, "Tournament created successfully", {
									id: "tournament-123",
									name: "Weekly Lightning",
									discipline: "Yu-Gi-Oh!",
									format: "SINGLE_ELIMINATION",
									status: "PUBLISHED",
									participantType: "PLAYER",
									allowMixedParticipants: false,
									maxParticipants: 8,
									description: "Weekly Lightning Tournament",
									startAt: "2025-11-24T11:33:08-04:00",
									endAt: "2025-11-24T11:33:08-04:00",
									location: "Online",
									webhookUrl: "https://api.evolutionygo.com/api/v1/tournaments/webhook",
									metadata: { banlist: "TCG" },
									createdAt: "2025-11-20T10:00:00.000Z",
									updatedAt: "2025-11-20T10:00:00.000Z",
								}),
								...errorResponses(401, 403),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
						body: t.Object({
							name: t.String({ minLength: 1 }),
							discipline: t.String({ minLength: 1 }),
							format: t.String({ minLength: 1 }),
							status: t.String({ minLength: 1 }),
							participantType: t.String({ minLength: 1 }),
							allowMixedParticipants: t.Boolean(),
							maxParticipants: t.Number({ minimum: 1 }),
							description: t.Optional(t.String()),
							startAt: t.Optional(t.String()),
							endAt: t.Optional(t.String()),
							location: t.Optional(t.String()),
							banlist: t.Optional(t.String()),
						}),
					},
				)
				.post(
					"/:tournamentId/enroll",
					async ({ params, bearer }) => {
						const { id } = this.jwt.decode(bearer as string) as { id: string };
						await this.tournamentEnrollmentUseCase.execute({
							userId: id,
							tournamentId: params.tournamentId,
						});
						return { success: true };
					},
					{
						detail: {
							tags: ["Lightning Tournaments"],
							summary: "Enroll in tournament",
							description: "Enrolls a user in a lightning tournament",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(TournamentActionSchema, "User enrolled successfully", {
									success: true,
								}),
								...errorResponses(401, 404),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				)
				.post(
					"/:tournamentId/withdraw",
					async ({ params, bearer }) => {
						const { id } = this.jwt.decode(bearer as string) as { id: string };
						await this.tournamentWithdrawalUseCase.execute({
							userId: id,
							tournamentId: params.tournamentId,
						});
						return { success: true };
					},
					{
						detail: {
							tags: ["Lightning Tournaments"],
							summary: "Withdraw from tournament",
							description: "Withdraws a user from a lightning tournament",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(TournamentActionSchema, "User withdrawn successfully", {
									success: true,
								}),
								...errorResponses(401, 404),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				)
				.get(
					"/:tournamentId/bracket",
					async ({ params }) => {
						const response = await fetch(
							`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/bracket`,
						);

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Failed to fetch bracket: ${response.status} ${text}`);
						}

						return response.json();
					},
					{
						detail: {
							tags: ["Bracket Management"],
							summary: "Get tournament bracket",
							description:
								"Retrieves the complete bracket structure including participant display names",
							responses: {
								200: jsonOk(TournamentBracketSchema, "Bracket retrieved successfully", {
									tournamentId: "tournament-001",
									rounds: [
										{
											roundNumber: 1,
											matches: [
												{
													id: "match-1",
													roundNumber: 1,
													position: 1,
													slotId: "R1-P1",
													nextMatchId: null,
													next: null,
													from: [],
													participant1: {
														id: "participant-1",
														displayName: "Player1",
														score: 2,
													},
													participant2: {
														id: "participant-2",
														displayName: "Player2",
														score: 1,
													},
													winnerId: "participant-1",
												},
											],
										},
									],
								}),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				)
				.post(
					"/:tournamentId/bracket",
					async ({ params, bearer }) => {
						const { role } = this.jwt.decode(bearer as string) as { role: string };
						if (role !== UserProfileRole.ADMIN) {
							throw new ForbiddenError("You do not have permission to generate brackets");
						}

						const response = await fetch(
							`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/bracket/generate-full`,
							{
								method: "POST",
							},
						);

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Failed to generate bracket: ${response.status} ${text}`);
						}

						return response.json();
					},
					{
						detail: {
							tags: ["Bracket Management"],
							summary: "Generate full tournament bracket",
							description:
								"Generates the complete bracket structure for a tournament. Requires admin privileges.",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(MessageResponseSchema, "Bracket generated successfully", {
									message: "Full bracket generated",
								}),
								...errorResponses(401, 403),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				)
				.post(
					"/:tournamentId/matches/:matchId/result",
					async ({ params, body, bearer }) => {
						const { role } = this.jwt.decode(bearer as string) as { role: string };
						if (role !== UserProfileRole.ADMIN) {
							throw new ForbiddenError("You do not have permission to record match results");
						}

						const response = await fetch(
							`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches/${params.matchId}/result`,
							{
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify(body),
							},
						);

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Failed to record match result: ${response.status} ${text}`);
						}

						return response.json();
					},
					{
						detail: {
							tags: ["Match Management"],
							summary: "Record match result",
							description:
								"Records the result of a match with participant scores. Requires admin privileges.",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(MessageResponseSchema, "Match result recorded successfully", {
									message: "Result saved",
								}),
								...errorResponses(401, 403),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
						body: MatchResultRequestSchema,
					},
				)
				.delete(
					"/:tournamentId/matches/:matchId/result",
					async ({ params, bearer }) => {
						const { role } = this.jwt.decode(bearer as string) as { role: string };
						if (role !== UserProfileRole.ADMIN) {
							throw new ForbiddenError("You do not have permission to annul match results");
						}

						const response = await fetch(
							`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches/${params.matchId}/result`,
							{
								method: "DELETE",
							},
						);

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Failed to annul match result: ${response.status} ${text}`);
						}

						return { message: "Match result annulled" };
					},
					{
						detail: {
							tags: ["Match Management"],
							summary: "Annul match result",
							description: "Deletes/annuls a match result. Requires admin privileges.",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(MatchResultAnnulledSchema, "Match result annulled successfully", {
									message: "Match result annulled",
								}),
								...errorResponses(401, 403),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				)
				.get(
					"/:tournamentId/entries",
					async ({ params }) => {
						const response = await fetch(
							`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/entries`,
						);

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Failed to get entries: ${response.status} ${text}`);
						}

						return response.json();
					},
					{
						detail: {
							tags: ["Lightning Tournaments"],
							summary: "Get tournament entries",
							description: "Retrieves all entries for a specific tournament.",
							responses: {
								200: jsonOk(TournamentEntryListSchema, "Entries retrieved successfully", [
									{
										id: "entry-123",
										tournamentId: "tournament-001",
										participantId: "participant-1",
										status: "CONFIRMED",
										groupId: null,
										seed: 1,
										metadata: {},
										createdAt: "2025-11-20T10:00:00.000Z",
										updatedAt: "2025-11-20T10:00:00.000Z",
										participantName: "Player1",
									},
								]),
								500: UPSTREAM_UNAVAILABLE,
							},
						},
					},
				),
		);
	}
}
