
import { Repository } from "typeorm";
import { dataSource } from "../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../evolution-types/src/entities/PlayerStatsEntity";
import { MatchResumeEntity } from "../../../evolution-types/src/entities/MatchResumeEntity";
import { IReportsRepository, PlayerRival, PlayerSeasonStats } from "../domain/IReportsRepository";

export class ReportsPostgresRepository implements IReportsRepository {
    private playerStatsRepository: any;
    private matchRepository: any;

    constructor() {
        this.playerStatsRepository = dataSource.getRepository(PlayerStatsEntity);
        this.matchRepository = dataSource.getRepository(MatchResumeEntity);
    }

    async getPlayerStats(userId: string, seasons: number[]): Promise<PlayerSeasonStats[]> {
        const stats = await this.playerStatsRepository
            .createQueryBuilder("stats")
            .where("stats.user_id = :userId", { userId })
            .andWhere("stats.season IN (:...seasons)", { seasons })
            .getMany();

        return stats.map(s => ({
            season: s.season,
            wins: s.wins,
            losses: s.losses,
            points: s.points
        }));
    }

    async getTopRivals(userId: string, seasons: number[]): Promise<PlayerRival[]> {
        const rivals: PlayerRival[] = [];

        for (const season of seasons) {
            const matches = await this.matchRepository
                .createQueryBuilder("match")
                .where("match.userId = :userId", { userId })
                .andWhere("match.season = :season", { season })
                .getMany();

            const rivalStats = new Map<string, { wins: number; matches: number; name: string }>();

            for (const match of matches) {
                if (!match.opponentIds || match.opponentIds.length === 0) continue;
                const rivalId = match.opponentIds[0]; // Assuming 1v1 mostly, taking first opponent
                const rivalName = match.opponentNames && match.opponentNames.length > 0 ? match.opponentNames[0] : "Unknown";

                if (!rivalStats.has(rivalId)) {
                    rivalStats.set(rivalId, { wins: 0, matches: 0, name: rivalName });
                }

                const stats = rivalStats.get(rivalId)!;
                stats.matches++;
                if (match.winner) { // If user is the winner?
                    // match.winner is a boolean. match.userId is the user. 
                    // References say 'winner' column.
                    // Usually means "Did this player win?". 
                    // Let's verify. Match.ts says "winner: boolean".
                    // MatchResumeEntity says "winner: boolean".
                    // In Evolution API, usually match is stored from perspective of userId. 
                    // If winner is true, userId won.
                    // Wait, I need to know if the user won against the rival.
                    // If match.winner is true, user won.
                    // So rival lost.
                    // But "wins" in PlayerRival context usually means "User's wins against Rival".
                    if (match.winner) {
                        stats.wins++;
                    }
                }
            }

            // Find top rival
            let topRivalId = "";
            let maxMatches = -1;

            for (const [id, stats] of rivalStats.entries()) {
                if (stats.matches > maxMatches) {
                    maxMatches = stats.matches;
                    topRivalId = id;
                }
            }

            if (topRivalId) {
                const stats = rivalStats.get(topRivalId)!;
                rivals.push({
                    season,
                    rivalId: topRivalId,
                    rivalName: stats.name,
                    matches: stats.matches,
                    wins: stats.wins
                });
            }
        }

        return rivals;
    }
}

