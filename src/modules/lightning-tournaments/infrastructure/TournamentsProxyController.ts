import { Elysia, t } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { JWT } from "src/shared/JWT";
import { UnauthorizedError } from "src/shared/errors/UnauthorizedError";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import type { TournamentRepository } from "../domain/TournamentRepository";
import { config } from "src/config";

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
                })
                .get("/participants/:id", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/participants/${params.id}`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get participant: ${response.status} ${text}`);
                    }

                    return response.json();
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
                })
                // Get bracket endpoint (includes participant displayNames)
                .get("/:tournamentId/bracket", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/bracket`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to fetch bracket: ${response.status} ${text}`);
                    }

                    return response.json();
                })

                // Matches endpoints
                .get("/:tournamentId/matches", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/matches`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get matches: ${response.status} ${text}`);
                    }

                    return response.json();
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
                    body: t.Object({
                        participants: t.Array(t.Object({
                            participantId: t.String(),
                            score: t.Number(),
                        }))
                    })
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
                    body: t.Object({
                        participants: t.Array(t.Object({
                            participantId: t.String(),
                            score: t.Number(),
                        }))
                    })
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
                })
                .put("/:tournamentId/publish", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to publish tournaments");
                    }

                    await this.tournamentRepository.publishTournament(params.tournamentId);
                    return { message: "Tournament published" };
                })
                .put("/:tournamentId/start", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to start tournaments");
                    }

                    await this.tournamentRepository.startTournament(params.tournamentId);
                    return { message: "Tournament started" };
                })
                .put("/:tournamentId/complete", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to complete tournaments");
                    }

                    await this.tournamentRepository.completeTournament(params.tournamentId);
                    return { message: "Tournament completed" };
                })
                .put("/:tournamentId/cancel", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to cancel tournaments");
                    }

                    await this.tournamentRepository.cancelTournament(params.tournamentId);
                    return { message: "Tournament cancelled" };
                })
                .put("/:tournamentId/entries/:participantId/confirm", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to confirm entries");
                    }

                    await this.tournamentRepository.confirmTournamentEntry(params.tournamentId, params.participantId);
                    return { message: "Entry confirmed" };
                })
        );
    }
}
