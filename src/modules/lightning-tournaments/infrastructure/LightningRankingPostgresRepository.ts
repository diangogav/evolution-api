import { config } from "src/config";
import { dataSource } from "../../../evolution-types/src/data-source";
import { LightningRankingEntity } from "../../../evolution-types/src/entities/LightningRankingEntity";
import { TournamentRanking } from "../domain/TournamentRanking";
import { TournamentRankingRepository } from "../domain/TournamentRankingRepository";

export class LightningRankingPostgresRepository implements TournamentRankingRepository {
    async findByUserId(userId: string): Promise<TournamentRanking | null> {
        const repository = dataSource.getRepository(LightningRankingEntity);
        const entity = await repository.findOne({ where: { userId } });

        if (!entity) return null;

        return TournamentRanking.create({
            userId: entity.userId,
            points: entity.points,
            tournamentsWon: entity.tournamentsWon,
            tournamentsPlayed: entity.tournamentsPlayed,
            lastUpdated: entity.updatedAt
        });
    }

    async save(ranking: TournamentRanking): Promise<void> {
        const repository = dataSource.getRepository(LightningRankingEntity);

        const existing = await repository.findOne({ where: { userId: ranking.userId } });

        if (existing) {
            existing.points = ranking.points;
            existing.tournamentsWon = ranking.tournamentsWon;
            existing.tournamentsPlayed = ranking.tournamentsPlayed;
            await repository.save(existing);
        } else {
            const newEntity = repository.create({
                userId: ranking.userId,
                points: ranking.points,
                tournamentsWon: ranking.tournamentsWon,
                tournamentsPlayed: ranking.tournamentsPlayed,
                season: config.season.toString()
            });
            await repository.save(newEntity);
        }
    }

    async getTopRankings(limit: number): Promise<TournamentRanking[]> {
        const repository = dataSource.getRepository(LightningRankingEntity);
        const entities = await repository.find({
            order: { points: "DESC" },
            take: limit,
            relations: ["user"]
        });

        return entities.map(entity => TournamentRanking.create({
            userId: entity.userId,
            points: entity.points,
            tournamentsWon: entity.tournamentsWon,
            tournamentsPlayed: entity.tournamentsPlayed,
            lastUpdated: entity.updatedAt
        }));
    }
}
