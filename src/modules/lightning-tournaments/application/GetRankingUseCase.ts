import { TournamentRanking } from "../domain/TournamentRanking";
import { TournamentRankingRepository } from "../domain/TournamentRankingRepository";

export class GetRankingUseCase {
    constructor(private readonly repository: TournamentRankingRepository) { }

    async execute(limit: number = 10): Promise<TournamentRanking[]> {
        return this.repository.getTopRankings(limit);
    }
}
