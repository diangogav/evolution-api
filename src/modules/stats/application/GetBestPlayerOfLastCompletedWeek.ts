import { PeriodUserStats } from "../domain/PeriodUserStats";
import { UserStatsRepository } from "../domain/UserStatsRepository";

export class GetBestPlayerOfLastCompletedWeek {
    constructor(private readonly repository: UserStatsRepository) {}

    async get(): Promise<PeriodUserStats[]> {
        return this.repository.getBestPlayerOfLastCompletedWeek();
    }
}