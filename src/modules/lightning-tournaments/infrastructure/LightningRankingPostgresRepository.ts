import { dataSource } from "src/evolution-types/src/data-source";
import { LightningRankingEntity } from "src/evolution-types/src/entities/LightningRankingEntity";
import { TournamentRanking } from "../domain/TournamentRanking";
import { TournamentRankingRepository } from "../domain/TournamentRankingRepository";
import { RankingWithUser } from "../domain/RankingWithUser";

export class LightningRankingPostgresRepository implements TournamentRankingRepository {
    async findByUserId(userId: string): Promise<TournamentRanking | null> {
        const repository = dataSource.getRepository(LightningRankingEntity);
        const entity = await repository.findOne({
            where: { userId },
            relations: ["user"]
        });

        if (!entity) {
            return null;
        }

        return TournamentRanking.fromPrimitives({
            userId: entity.userId,
            points: entity.points,
            tournamentsWon: entity.tournamentsWon,
            tournamentsPlayed: entity.tournamentsPlayed,
            season: entity.season,
        });
    }

    async save(ranking: TournamentRanking): Promise<void> {
        const repository = dataSource.getRepository(LightningRankingEntity);

        const existingEntity = await repository.findOne({
            where: { userId: ranking.getUserId() }
        });

        if (existingEntity) {
            existingEntity.points = ranking.points;
            existingEntity.tournamentsWon = ranking.tournamentsWon;
            existingEntity.tournamentsPlayed = ranking.tournamentsPlayed;
            existingEntity.season = ranking.season;
            await repository.save(existingEntity);
        } else {
            const newEntity = repository.create({
                userId: ranking.getUserId(),
                points: ranking.points,
                tournamentsWon: ranking.tournamentsWon,
                tournamentsPlayed: ranking.tournamentsPlayed,
                season: ranking.season,
            });
            await repository.save(newEntity);
        }
    }

    async getTopRankings(limit: number): Promise<RankingWithUser[]> {
        const repository = dataSource.getRepository(LightningRankingEntity);
        const rankings = await repository.find({
            order: { points: "DESC" },
            take: limit,
            relations: ["user"]
        });

        return rankings.map(entity => ({
            userId: entity.userId,
            points: entity.points,
            tournamentsWon: entity.tournamentsWon,
            tournamentsPlayed: entity.tournamentsPlayed,
            user: entity.user ? {
                username: entity.user.username,
                email: entity.user.email
            } : null
        }));
    }
}
