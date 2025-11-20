import { Elysia, t } from "elysia";

export class TournamentsProxyController {
    constructor(private readonly tournamentsApiUrl: string) { }

    routes(app: Elysia) {
        return app.group("/tournaments", (app) =>
            app
                // Players endpoints
                .post("/players", async ({ body }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/players`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to create player: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    body: t.Object({
                        displayName: t.String(),
                        email: t.String(),
                        countryCode: t.Optional(t.String()),
                    })
                })
                .get("/players/:id", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/players/${params.id}`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get player: ${response.status} ${text}`);
                    }

                    return response.json();
                })

                // Participants endpoints
                .post("/participants", async ({ body }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/participants`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to create participant: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    body: t.Object({
                        type: t.String(),
                        referenceId: t.String(),
                        displayName: t.String(),
                        countryCode: t.Optional(t.String()),
                    })
                })
                .get("/participants/:id", async ({ params }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/participants/${params.id}`);

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to get participant: ${response.status} ${text}`);
                    }

                    return response.json();
                })

                // Tournament entries endpoints
                .post("/:tournamentId/entries", async ({ params, body }) => {
                    const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${params.tournamentId}/entries`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to create entry: ${response.status} ${text}`);
                    }

                    return response.json();
                }, {
                    body: t.Object({
                        participantId: t.String(),
                        status: t.String(),
                    })
                })

                // Bracket generation endpoint
                .post("/:tournamentId/bracket/generate", async ({ params }) => {
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
                .post("/:tournamentId/matches/:matchId/result", async ({ params, body }) => {
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
