import { TournamentRanking } from "./TournamentRanking";
import { RankingWithUser } from "./RankingWithUser";

export interface TournamentRankingRepository {
    findByUserId(userId: string): Promise<TournamentRanking | null>;
    save(ranking: TournamentRanking): Promise<void>;
    getTopRankings(limit: number): Promise<RankingWithUser[]>;
}
