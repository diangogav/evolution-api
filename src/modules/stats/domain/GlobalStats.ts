export interface GlobalStats {
    totalDuels: number;
    activeBanLists: number;
    avgDuelsPerBanList: number;
}

export interface ChartData {
    name: string;
    value: number;
}

export interface BanListBreakdown {
    banListName: string;
    totalDuels: number;
    percentage: number;
    popularity: number; // 0-100 scale for UI
}

export interface DailyDuelStat {
    date: string;
    banListName: string;
    count: number;
}

export interface GlobalStatsRepository {
    getGlobalStats(season: number): Promise<GlobalStats>;
    getDuelsPerSeason(): Promise<ChartData[]>;
    getDuelsPerBanList(season: number): Promise<BanListBreakdown[]>;
    getDailyDuels(season: number): Promise<DailyDuelStat[]>;
}
