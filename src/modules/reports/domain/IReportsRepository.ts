export interface PlayerSeasonStats {
    season: number;
    wins: number;
    losses: number;
    points: number;
}

export interface PlayerRival {
    season: number;
    rivalId: string;
    rivalName: string;
    matches: number;
    wins: number;
}

export interface IReportsRepository {
    getPlayerStats(userId: string, seasons: number[]): Promise<PlayerSeasonStats[]>;
    getTopRivals(userId: string, seasons: number[]): Promise<PlayerRival[]>;
}
