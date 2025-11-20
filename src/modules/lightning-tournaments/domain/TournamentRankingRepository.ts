import { TournamentRanking } from "./TournamentRanking";

export interface TournamentRankingRepository {
    findByUserId(userId: string): Promise<TournamentRanking | null>;
    save(ranking: TournamentRanking): Promise<void>;
    getTopRankings(limit: number): Promise<TournamentRanking[]>;
}
