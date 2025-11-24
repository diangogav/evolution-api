export interface RankingWithUser {
    userId: string;
    points: number;
    tournamentsWon: number;
    tournamentsPlayed: number;
    user: {
        username: string;
        email: string;
    } | null;
}
