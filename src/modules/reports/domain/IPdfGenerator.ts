export interface SeasonStats {
    season: number;
    points: number;
    wins: number;
    losses: number;
    winRate: string;
}

export interface SeasonRival {
    name: string;
    wins: number;
    matches: number;
}

export interface SeasonReportData {
    season: number;
    stats: SeasonStats | null;
    rival: SeasonRival | null;
}

export interface WrappedReportData {
    totalMatches: number;
    totalWins: number;
    totalLosses: number;
    totalWinRate: string;
    seasons: SeasonReportData[];
}

export interface IPdfGenerator {
    generate(data: WrappedReportData): Promise<Buffer>;
}
