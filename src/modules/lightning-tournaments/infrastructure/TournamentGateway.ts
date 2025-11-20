import { config } from "src/config";
import { TournamentRepository } from "../domain/TournamentRepository";

export class TournamentGateway implements TournamentRepository {
    async createUserTournament({ displayName, email }: { displayName: string; email: string; }): Promise<string> {
        const createPlayerResponse = await fetch(`${config.tournaments.apiUrl}/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName, email }),
        });

        if (!createPlayerResponse.ok) {
            const text = await createPlayerResponse.text();
            throw new Error(`Failed to create player: ${createPlayerResponse.status} ${text}`);
        }

        const player = await createPlayerResponse.json();

        const response = await fetch(`${config.tournaments.apiUrl}/participants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'PLAYER', referenceId: player.id, displayName }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create participant: ${response.status} ${text}`);
        }

        const participant = await response.json();
        return participant.id;
    }

    async enrollTournament({ tournamentId, participantId }: { tournamentId: string; participantId: string; }): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantId, status: 'CONFIRMED' }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create entry: ${response.status} ${text}`);
        }

        return;
    }

}