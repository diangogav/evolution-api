import { dataSource } from "../../../evolution-types/src/data-source";
import { BanListBreakdown, ChartData, DailyDuelStat, GlobalStats, GlobalStatsRepository } from "../domain/GlobalStats";

interface StatsRow {
    season?: number;
    ban_list_name?: string;
    total_duels: number;
}

interface DailyStatsRow {
    date: string;
    ban_list_name: string;
    count: number;
}

export class GlobalStatsPostgresRepository implements GlobalStatsRepository {
    async getGlobalStats(season: number): Promise<GlobalStats> {
        const result = await dataSource.query(`
            SELECT 
                COALESCE(SUM(total_duels), 0)::int as total_duels,
                COUNT(DISTINCT ban_list_name)::int as active_banlists
            FROM stats_daily_summary
            WHERE season = $1
        `, [season]);

        const totalDuels = result[0]?.total_duels || 0;
        const activeBanLists = result[0]?.active_banlists || 0;
        const avgDuelsPerBanList = activeBanLists > 0 ? Math.floor(totalDuels / activeBanLists) : 0;

        return {
            totalDuels,
            activeBanLists,
            avgDuelsPerBanList
        };
    }

    async getDuelsPerSeason(): Promise<ChartData[]> {
        const result = await dataSource.query(`
            SELECT 
                season, 
                SUM(total_duels)::int as total_duels
            FROM stats_daily_summary
            GROUP BY season
            ORDER BY season ASC
        `);

        return result.map((row: StatsRow) => ({
            name: `Season ${row.season}`,
            value: row.total_duels
        }));
    }

    async getDuelsPerBanList(season: number): Promise<BanListBreakdown[]> {
        const result = await dataSource.query(`
            SELECT 
                ban_list_name, 
                SUM(total_duels)::int as total_duels
            FROM stats_daily_summary
            WHERE season = $1
            GROUP BY ban_list_name
            ORDER BY total_duels DESC
        `, [season]);

        const totalSeasonDuels = result.reduce((sum: number, row: StatsRow) => sum + row.total_duels, 0);

        return result.map((row: StatsRow) => ({
            banListName: row.ban_list_name!,
            totalDuels: row.total_duels,
            percentage: totalSeasonDuels > 0 ? parseFloat(((row.total_duels / totalSeasonDuels) * 100).toFixed(1)) : 0,
            popularity: totalSeasonDuels > 0 ? Math.min(100, Math.round((row.total_duels / totalSeasonDuels) * 100 * 3)) : 0 // Scale for UI bar
        }));
    }

    async getDailyDuels(season: number): Promise<DailyDuelStat[]> {
        const result = await dataSource.query(`
            SELECT 
                date::text as date,
                ban_list_name,
                total_duels::int as count
            FROM stats_daily_summary
            WHERE season = $1 
            ORDER BY date ASC
        `, [season]);

        return result.map((row: DailyStatsRow) => ({
            date: row.date,
            banListName: row.ban_list_name,
            count: row.count
        }));
    }
}
