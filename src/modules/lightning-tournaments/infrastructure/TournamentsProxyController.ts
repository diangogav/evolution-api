import { Elysia, t } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { JWT } from "src/shared/JWT";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { UnauthorizedError } from "src/shared/errors/UnauthorizedError";

export class TournamentsProxyController {
    constructor(
        private readonly tournamentsApiUrl: string,
        private readonly jwt: JWT
    ) { }

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
                .post("/:tournamentId/bracket/generate", async ({ params, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to generate brackets");
                    }

                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/bracket/generate`, {
                        method: 'POST',
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to generate bracket: ${response.status} ${text}`);
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
        );
    }
}
