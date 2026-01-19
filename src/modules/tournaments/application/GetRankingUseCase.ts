import { TournamentRankingRepository } from "../domain/TournamentRankingRepository";
import { RankingWithUser } from "../domain/RankingWithUser";

export class GetRankingUseCase {
    constructor(private readonly repository: TournamentRankingRepository) { }

    async execute(limit: number = 10): Promise<RankingWithUser[]> {
        return this.repository.getTopRankings(limit);
    }
}
