import { BanListBreakdown, ChartData, DailyDuelStat, GlobalStats, GlobalStatsRepository } from "../domain/GlobalStats";

export interface GlobalStatsResponse {
    stats: GlobalStats;
    historical: ChartData[];
    banListBreakdown: BanListBreakdown[];
    dailyDuels: DailyDuelStat[];
}

export class GetGlobalStats {
    constructor(private readonly repository: GlobalStatsRepository) { }

    async execute(season: number): Promise<GlobalStatsResponse> {
        const [stats, historical, banListBreakdown, dailyDuels] = await Promise.all([
            this.repository.getGlobalStats(season),
            this.repository.getDuelsPerSeason(),
            this.repository.getDuelsPerBanList(season),
            this.repository.getDailyDuels(season)
        ]);

        return { stats, historical, banListBreakdown, dailyDuels };
    }
}
