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

export class LightningTournamentController {
    constructor(
        private readonly updateRanking: UpdateRankingUseCase,
        private readonly getRanking: GetRankingUseCase,
        private readonly createTournament: CreateTournamentProxyUseCase,
        private readonly tournamentEnrollmentUseCase: TournamentEnrollmentUseCase,
        private readonly tournamentWithdrawalUseCase: TournamentWithdrawalUseCase,
        private readonly jwt: JWT
    ) { }

    routes(app: Elysia) {
        return app.group("/lightning-tournaments", (app) =>
            app
                .use(bearer())
                .post("/webhook", async ({ body }) => {
                    const { tournamentId } = body as { tournamentId: string; winnerId: string; completedAt: string };
                    // Process all participants' rankings based on final positions
                    await this.updateRanking.execute({ tournamentId });
                    return { success: true };
                }, {
                    detail: {
                        tags: ['Lightning Tournaments'],
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
                                            maxParticipants: 8
                                        }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' }
                        }
                    }
                })
                .post("/enroll", async ({ body }) => {
                    const { userId, tournamentId } = body as { userId: string; tournamentId: string };
                    await this.tournamentEnrollmentUseCase.execute({ userId, tournamentId });
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
                    body: t.Object({
                        userId: t.String(),
                        tournamentId: t.String(),
                    })
                })
                .post("/withdraw", async ({ body }) => {
                    const { userId, tournamentId } = body as { userId: string; tournamentId: string };
                    await this.tournamentWithdrawalUseCase.execute({ userId, tournamentId });
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
                    body: t.Object({
                        userId: t.String(),
                        tournamentId: t.String(),
                    })
                })
        );
    }
}
