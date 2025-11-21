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

    async withdrawTournament(tournamentId: string, participantId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/entries/${participantId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to withdraw from tournament: ${response.status} ${text}`);
        }
    }

    async editMatchResult(tournamentId: string, matchId: string, participants: Array<{ participantId: string; score: number; result?: string }>): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/matches/${matchId}/result`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participants }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to edit match result: ${response.status} ${text}`);
        }
    }

    async annulMatchResult(tournamentId: string, matchId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/matches/${matchId}/result`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to annul match result: ${response.status} ${text}`);
        }
    }

    async publishTournament(tournamentId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/publish`, {
            method: 'PUT',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to publish tournament: ${response.status} ${text}`);
        }
    }

    async startTournament(tournamentId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/start`, {
            method: 'PUT',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to start tournament: ${response.status} ${text}`);
        }
    }

    async completeTournament(tournamentId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/complete`, {
            method: 'PUT',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to complete tournament: ${response.status} ${text}`);
        }
    }

    async cancelTournament(tournamentId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/cancel`, {
            method: 'PUT',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to cancel tournament: ${response.status} ${text}`);
        }
    }

    async confirmTournamentEntry(tournamentId: string, participantId: string): Promise<void> {
        const response = await fetch(`${config.tournaments.apiUrl}/tournaments/${tournamentId}/entries/${participantId}/confirm`, {
            method: 'PUT',
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to confirm tournament entry: ${response.status} ${text}`);
        }
    }

}