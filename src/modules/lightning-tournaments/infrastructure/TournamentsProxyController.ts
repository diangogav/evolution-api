import { Elysia } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { JWT } from "src/shared/JWT";
import { UnauthorizedError } from "src/shared/errors/UnauthorizedError";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import type { TournamentRepository } from "../domain/TournamentRepository";
import { config } from "src/config";
import { MatchResultRequestSchema } from "./swagger-schemas";


export class TournamentsProxyController {
    private readonly tournamentsApiUrl: string;

    constructor(
        private readonly jwt: JWT,
        private readonly tournamentRepository: TournamentRepository
    ) {
        this.tournamentsApiUrl = config.tournaments.apiUrl;
    }

    routes(app: Elysia) {
        return app.group("/tournaments", (app) =>
            app
                .use(bearer())
                .get("/players/:id", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/players/${params.id}`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get player: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Players & Participants'],
                        summary: 'Get player by ID',
                        description: 'Retrieves player information from the tournaments service',
                        responses: {
                            200: {
                                description: 'Player information retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            id: 'player-123',
                                            displayName: 'JohnDoe',
                                            userId: 'user-456'
                                        }
                                    }
                                }
                            },
                            404: { description: 'Player not found' }
                        }
                    }
                })
                .get("/participants/:id", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/participants/${params.id}`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get participant: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Players & Participants'],
                        summary: 'Get participant by ID',
                        description: 'Retrieves participant information from the tournaments service',
                        responses: {
                            200: {
                                description: 'Participant information retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: {
                                            id: 'participant-789',
                                            playerId: 'player-123',
                                            tournamentId: 'tournament-001',
                                            displayName: 'JohnDoe',
                                            status: 'confirmed'
                                        }
                                    }
                                }
                            },
                            404: { description: 'Participant not found' }
                        }
                    }
                })
                // Bracket generation endpoint
                .post("/:tournamentId/bracket/generate-full", async ({ params, bearer }) => {
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
                // Get bracket endpoint (includes participant displayNames)
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

                // Matches endpoints
                .get("/:tournamentId/matches", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get matches: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Match Management'],
                        summary: 'Get all tournament matches',
                        description: 'Retrieves all matches for a specific tournament',
                        responses: {
                            200: {
                                description: 'Matches retrieved successfully',
                                content: {
                                    'application/json': {
                                        example: [
                                            {
                                                id: 'match-1',
                                                tournamentId: 'tournament-001',
                                                roundNumber: 1,
                                                matchNumber: 1,
                                                participants: [
                                                    { participantId: 'p1', displayName: 'Player1', score: 2, result: 'win' },
                                                    { participantId: 'p2', displayName: 'Player2', score: 1, result: 'loss' }
                                                ],
                                                completedAt: '2025-11-24T10:00:00Z'
                                            }
                                        ]
                                    }
                                }
                            },
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
                .put("/:tournamentId/matches/:matchId/result", async ({ params, body, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to edit match results");
                    }

                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches/${params.matchId}/result`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to edit match result: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    detail: {
                        tags: ['Match Management'],
                        summary: 'Edit match result',
                        description: 'Updates an existing match result with new participant scores. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Match result updated successfully',
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
                .delete("/:tournamentId/participants/:participantId", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to remove participants");
                    }

                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/entries/${params.participantId}`, {
                        method: 'DELETE',
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to remove participant: ${response.status} ${text}`);
                    }

                    return { message: "Participant removed" };
                }, {
                    detail: {
                        tags: ['Participant Management'],
                        summary: 'Remove participant from tournament',
                        description: 'Removes a participant from a tournament. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Participant removed successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Participant removed' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament or participant not found' }
                        }
                    }
                })
                .put("/:tournamentId/publish", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to publish tournaments");
                    }

                    await this.tournamentRepository.publishTournament(params.tournamentId);
                    return { message: "Tournament published" };
                }, {
                    detail: {
                        tags: ['Tournament Lifecycle'],
                        summary: 'Publish tournament',
                        description: 'Changes tournament status to published. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Tournament published successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Tournament published' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament not found' }
                        }
                    }
                })
                .put("/:tournamentId/start", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to start tournaments");
                    }

                    await this.tournamentRepository.startTournament(params.tournamentId);
                    return { message: "Tournament started" };
                }, {
                    detail: {
                        tags: ['Tournament Lifecycle'],
                        summary: 'Start tournament',
                        description: 'Changes tournament status to started/in-progress. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Tournament started successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Tournament started' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament not found' }
                        }
                    }
                })
                .put("/:tournamentId/complete", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to complete tournaments");
                    }

                    await this.tournamentRepository.completeTournament(params.tournamentId);
                    return { message: "Tournament completed" };
                }, {
                    detail: {
                        tags: ['Tournament Lifecycle'],
                        summary: 'Complete tournament',
                        description: 'Changes tournament status to completed. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Tournament completed successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Tournament completed' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament not found' }
                        }
                    }
                })
                .put("/:tournamentId/cancel", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to cancel tournaments");
                    }

                    await this.tournamentRepository.cancelTournament(params.tournamentId);
                    return { message: "Tournament cancelled" };
                }, {
                    detail: {
                        tags: ['Tournament Lifecycle'],
                        summary: 'Cancel tournament',
                        description: 'Changes tournament status to cancelled. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Tournament cancelled successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Tournament cancelled' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament not found' }
                        }
                    }
                })
                .put("/:tournamentId/entries/:participantId/confirm", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to confirm entries");
                    }

                    await this.tournamentRepository.confirmTournamentEntry(params.tournamentId, params.participantId);
                    return { message: "Entry confirmed" };
                }, {
                    detail: {
                        tags: ['Participant Management'],
                        summary: 'Confirm tournament entry',
                        description: 'Confirms a participant entry for a tournament. Requires admin privileges.',
                        security: [{ bearerAuth: [] }],
                        responses: {
                            200: {
                                description: 'Entry confirmed successfully',
                                content: {
                                    'application/json': {
                                        example: { message: 'Entry confirmed' }
                                    }
                                }
                            },
                            401: { description: 'Unauthorized - Admin role required' },
                            404: { description: 'Tournament or participant not found' }
                        }
                    }
                })
        );
    }
}
