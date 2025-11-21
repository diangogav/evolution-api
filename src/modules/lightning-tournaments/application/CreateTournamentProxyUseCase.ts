export interface CreateTournamentInput {
    name: string;
    discipline: string;
    format: string;
    status: string;
    participantType: string;
    allowMixedParticipants: boolean;
    maxParticipants: number;
    description?: string;
    startAt?: string;
    endAt?: string;
    location?: string;
    banlist?: string; // e.g., "Edison", "TCG", "OCG", "Goat"
}

interface Tournament {
    id: string;
    name: string;
    description?: string | null;
    discipline: string;
    format: string;
    status: string;
    allowMixedParticipants: boolean;
    participantType?: string | null;
    maxParticipants?: number | null;
    startAt?: string | null;
    endAt?: string | null;
    location?: string | null;
    webhookUrl?: string | null;
    metadata: Record<string, unknown>;
}

export class CreateTournamentProxyUseCase {
    constructor(
        private readonly tournamentsApiUrl: string,
        private readonly webhookUrl: string
    ) { }

    async execute(input: CreateTournamentInput): Promise<Tournament> {
        const { banlist, ...tournamentFields } = input;

        const tournamentData = {
            ...tournamentFields,
            webhookUrl: this.webhookUrl,
            status: "PUBLISHED",
            metadata: banlist ? { banlist } : {}
        };

        const response = await fetch(`${this.tournamentsApiUrl}/tournaments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tournamentData),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create tournament: ${response.status} ${text}`);
        }

        return await response.json() as Tournament;
    }
}
