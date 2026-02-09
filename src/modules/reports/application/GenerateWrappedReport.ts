import { IReportsRepository } from "../domain/IReportsRepository";
import { IPdfGenerator, WrappedReportData } from "../domain/IPdfGenerator";

export class GenerateWrappedReport {
    constructor(
        private readonly repository: IReportsRepository,
        private readonly pdfGenerator: IPdfGenerator
    ) { }

    async execute(userId: string): Promise<Buffer> {
        const seasons = [3, 4, 5];
        const playerStats = await this.repository.getPlayerStats(userId, seasons);
        const rivals = await this.repository.getTopRivals(userId, seasons);

        // Aggregate stats
        const totalWins = playerStats.reduce((sum, s) => sum + s.wins, 0);
        const totalLosses = playerStats.reduce((sum, s) => sum + s.losses, 0);
        const totalMatches = totalWins + totalLosses;
        const totalWinRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) + "%" : "0%";

        const reportData: WrappedReportData = {
            totalMatches,
            totalWins,
            totalLosses,
            totalWinRate,
            seasons: seasons.map(season => {
                const stats = playerStats.find(s => s.season === season);
                const rival = rivals.find(r => r.season === season);

                if (!stats) return {
                    season,
                    stats: null,
                    rival: null
                };

                const winRate = (stats.wins + stats.losses) > 0
                    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) + "%"
                    : "0%";

                return {
                    season,
                    stats: {
                        season: stats.season,
                        points: stats.points,
                        wins: stats.wins,
                        losses: stats.losses,
                        winRate
                    },
                    rival: rival ? {
                        name: rival.rivalName,
                        wins: rival.wins,
                        matches: rival.matches
                    } : null
                };
            })
        };

        return this.pdfGenerator.generate(reportData);
    }
}

