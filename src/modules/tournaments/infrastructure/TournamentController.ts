import { Elysia, t } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { UpdateRankingUseCase } from "../application/UpdateRankingUseCase";
import { GetRankingUseCase } from "../application/GetRankingUseCase";
import { CreateTournamentInput, CreateTournamentProxyUseCase } from "../application/CreateTournamentProxyUseCase";
import { TournamentEnrollmentUseCase } from "../application/TournamentEnrollmentUseCase";
import { TournamentWithdrawalUseCase } from "../application/TournamentWithdrawalUseCase";
import { JWT } from "src/shared/JWT";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { UnauthorizedError } from "src/shared/errors/UnauthorizedError";
import { config } from "src/config";
import { MatchResultRequestSchema } from "./swagger-schemas";

export class TournamentController {
    private readonly tournamentsApiUrl: string;

    constructor(
        private readonly updateRanking: UpdateRankingUseCase,
        private readonly getRanking: GetRankingUseCase,
        private readonly createTournament: CreateTournamentProxyUseCase,
        private readonly tournamentEnrollmentUseCase: TournamentEnrollmentUseCase,
        private readonly tournamentWithdrawalUseCase: TournamentWithdrawalUseCase,
        private readonly jwt: JWT
    ) {
        this.tournamentsApiUrl = config.tournaments.apiUrl;

    }

    routes(app: Elysia) {
        return app.group("/tournaments", (app) =>
            app
                .use(bearer())
                .get("/", async () => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get tournaments: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
                        summary: 'Get all tournaments',
                        description: 'Retrieves a list of all tournaments from the tournaments service',
                        responses: {
                            200: {
                                description: 'Tournaments retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: [
                                            {
                                                id: 'tournament-001',
                                                name: 'Tournament 1',
                                                status: 'open'
                                            },
                                            {
                                                id: 'tournament-002',
                                                name: 'Tournament 2',
                                                status: 'closed'
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                })
                .post("/webhook", async ({ body }) => {
                    const { tournamentId } = body as { tournamentId: string; winnerId: string; completedAt: string };
                    // Process all participants' rankings based on final positions
                    await this.updateRanking.execute({ tournamentId });
                    return { success: true };
                }, {
                    detail: {
                        tags: ['Tournaments'],
                        summary: 'Tournament completion webhook',
                        description: 'Webhook endpoint called when a tournament is completed to update rankings',
                        responses: {
                            200: {
                                description: 'Rankings updated successfully',
                                content: {
                                    'application/json': {
                                        example: { success: true }
                                    }
                                }
                            }
                        }
                    },
                    body: t.Object({
                        winnerId: t.String(),
                        tournamentId: t.String(),
                        completedAt: t.String(),
                    })
                })
                .get("/ranking", async ({ query }) => {
                    const limit = query.limit ? parseInt(query.limit as string) : 10;
                    const rankings = await this.getRanking.execute(limit);
                    return rankings; // Already plain objects with user data
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
                        summary: 'Get lightning tournament ranking',
                        description: 'Retrieves the top players ranking for lightning tournaments',
                        responses: {
                            200: {
                                description: 'Ranking retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: [
                                            {
                                                userId: 'user-1',
                                                username: 'Player1',
                                                email: 'player1@example.com',
                                                points: 150,
                                                tournamentsWon: 5,
                                                tournamentsPlayed: 20
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    query: t.Object({
                        limit: t.Optional(t.String())
                    })
                })
                .post("/", async ({ body, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to create tournaments");
                    }
                    const tournament = await this.createTournament.execute(body as CreateTournamentInput);
                    return tournament;
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
                        summary: 'Create lightning tournament',
                        description: 'Creates a new lightning tournament. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Tournament created successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            id: 'tournament-123',
                                            name: 'Weekly Lightning',
                                            discipline: 'Yu-Gi-Oh!',
                                            format: 'Single Elimination',
                                            status: 'PUBLISHED',
                                            participantType: 'SINGLE',
                                            allowMixedParticipants: false,
                                            maxParticipants: 8,
                                            description: 'Weekly Lightning Tournament',
                                            startAt: '2025-11-24T11:33:08-04:00',
                                            endAt: '2025-11-24T11:33:08-04:00',
                                            location: 'Online',
                                            banlist: 'TCG',
                                        }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' }
                        }
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
                    })
                })
                .post("/:tournamentId/enroll", async ({ params, bearer }) => {
                    const { id } = this.jwt.decode(bearer as string) as { id: string };
                    await this.tournamentEnrollmentUseCase.execute({ userId: id, tournamentId: params.tournamentId });
                    return { success: true };
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
                        summary: 'Enroll in tournament',
                        description: 'Enrolls a user in a lightning tournament',
                        responses: {
                            200: {
                                description: 'User enrolled successfully',
                                content: {
                                    'application/json': {
                                        example: { success: true }
                                    }
                                }
                            },
                            404: { description: 'User or tournament not found' },
                            409: { description: 'User already enrolled or tournament full' }
                        }
                    },
                })
                .post("/:tournamentId/withdraw", async ({ params, bearer }) => {
                    const { id } = this.jwt.decode(bearer as string) as { id: string };
                    await this.tournamentWithdrawalUseCase.execute({ userId: id, tournamentId: params.tournamentId });
                    return { success: true };
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
                        summary: 'Withdraw from tournament',
                        description: 'Withdraws a user from a lightning tournament',
                        responses: {
                            200: {
                                description: 'User withdrawn successfully',
                                content: {
                                    'application/json': {
                                        example: { success: true }
                                    }
                                }
                            },
                            404: { description: 'User, tournament, or enrollment not found' }
                        }
                    },
                })
                .get("/:tournamentId/bracket", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/bracket`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to fetch bracket: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Bracket Management'],
                        summary: 'Get tournament bracket',
                        description: 'Retrieves the complete bracket structure including participant display names',
                        responses: {
                            200: {
                                description: 'Bracket retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            tournamentId: 'tournament-001',
                                            rounds: [
                                                {
                                                    roundNumber: 1,
                                                    matches: [
                                                        {
                                                            id: 'match-1',
                                                            tournamentId: 'tournament-001',
                                                            roundNumber: 1,
                                                            participants: [
                                                                { participantId: 'p1', displayName: 'Player1', score: 2, result: 'win' },
                                                                { participantId: 'p2', displayName: 'Player2', score: 1, result: 'loss' }
                                                            ],
                                                            completedAt: '2025-11-24T10:00:00Z'
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            },
                            404: { description: 'Tournament or bracket not found' }
                        }
                    }
                })
                .post("/:tournamentId/bracket", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to generate brackets");
                    }

                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/bracket/generate-full`, {
                        method: 'POST',
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to generate bracket: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Bracket Management'],
                        summary: 'Generate full tournament bracket',
                        description: 'Generates the complete bracket structure for a tournament. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Bracket generated successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            tournamentId: 'tournament-001',
                                            rounds: [
                                                {
                                                    roundNumber: 1,
                                                    matches: [
                                                        {
                                                            id: 'match-1',
                                                            tournamentId: 'tournament-001',
                                                            roundNumber: 1,
                                                            matchNumber: 1,
                                                            participants: [
                                                                { participantId: 'p1', displayName: 'Player1', score: null, result: null },
                                                                { participantId: 'p2', displayName: 'Player2', score: null, result: null }
                                                            ],
                                                            completedAt: null
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament not found' }
                        }
                    }
                })
                .post("/:tournamentId/matches/:matchId/result", async ({ params, body, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to record match results");
                    }

                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches/${params.matchId}/result`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to record match result: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Match Management'],
                        summary: 'Record match result',
                        description: 'Records the result of a match with participant scores. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Match result recorded successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            id: 'match-1',
                                            tournamentId: 'tournament-001',
                                            roundNumber: 1,
                                            participants: [
                                                { participantId: 'p1', displayName: 'Player1', score: 2, result: 'win' },
                                                { participantId: 'p2', displayName: 'Player2', score: 1, result: 'loss' }
                                            ],
                                            completedAt: '2025-11-24T10:00:00Z'
                                        }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament or match not found' }
                        }
                    },
                    body: MatchResultRequestSchema
                })
                .delete("/:tournamentId/matches/:matchId/result", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to annul match results");
                    }

                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches/${params.matchId}/result`, {
                        method: 'DELETE',
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to annul match result: ${response.status} ${text}`);
                    }

                    return { message: "Match result annulled" };
                }, {
                    detail: {
                        tags: ['Match Management'],
                        summary: 'Annul match result',
                        description: 'Deletes/annuls a match result. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Match result annulled successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Match result annulled' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament or match not found' }
                        }
                    }
                })
                .get("/:tournamentId/entries", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/entries`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get entries: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
                        summary: 'Get tournament entries',
                        description: 'Retrieves all entries for a specific tournament.',
                        responses: {
                            200: {
                                description: 'Entries retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            entries: [
                                                {
                                                    id: '123',
                                                    userId: '456',
                                                    tournamentId: '789',
                                                    createdAt: '2023-01-01T00:00:00.000Z',
                                                    updatedAt: '2023-01-01T00:00:00.000Z'
                                                }
                                            ]
                                        }
                                    }
                                }
                            },
                            404: { description: 'Tournament not found' }
                        }
                    }
                })
        );
    }
}
