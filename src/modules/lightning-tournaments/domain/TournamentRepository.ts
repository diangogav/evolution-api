export interface TournamentRepository {
    createUserTournament({ displayName, email }: { displayName: string; email: string; }): Promise<string>;
    enrollTournament({ tournamentId, participantId }: { tournamentId: string; participantId: string; }): Promise<void>;
    withdrawTournament(tournamentId: string, participantId: string): Promise<void>;
    editMatchResult(tournamentId: string, matchId: string, participants: Array<{ participantId: string; score: number; result?: string }>): Promise<void>;
    annulMatchResult(tournamentId: string, matchId: string): Promise<void>;
    publishTournament(tournamentId: string): Promise<void>;
    startTournament(tournamentId: string): Promise<void>;
    completeTournament(tournamentId: string): Promise<void>;
    cancelTournament(tournamentId: string): Promise<void>;
    confirmTournamentEntry(tournamentId: string, participantId: string): Promise<void>;
}