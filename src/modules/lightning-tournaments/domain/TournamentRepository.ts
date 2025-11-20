export interface TournamentRepository {
    createUserTournament({ displayName, email }: { displayName: string; email: string; }): Promise<string>;
    enrollTournament({ tournamentId, participantId }: { tournamentId: string; participantId: string; }): Promise<void>;
}