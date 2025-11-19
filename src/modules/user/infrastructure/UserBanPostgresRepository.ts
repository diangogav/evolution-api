import { dataSource } from "../../../evolution-types/src/data-source";
import { UserBanEntity } from "../../../evolution-types/src/entities/UserBanEntity";
import { UserBan } from "../domain/UserBan";
import { UserBanRepository } from "../domain/UserBanRepository";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";

export class UserBanPostgresRepository implements UserBanRepository {
    async banUser(ban: UserBan): Promise<void> {
        const repository = dataSource.getRepository(UserBanEntity);
        const userRepository = dataSource.getRepository(UserProfileEntity);
        const user = await userRepository.findOneOrFail({ where: { id: ban.userId } });
        const bannedBy = await userRepository.findOneOrFail({ where: { id: ban.bannedBy } });
        const entity = repository.create({
            id: ban.id,
            user,
            reason: ban.reason,
            bannedAt: ban.bannedAt,
            expiresAt: ban.expiresAt,
            bannedBy,
            createdAt: ban.createdAt,
            updatedAt: ban.updatedAt,
        });
        await repository.save(entity);

        user.deletedAt = new Date();
        await userRepository.save(user);
    }

    async findActiveBanByUserId(userId: string): Promise<UserBan | null> {
        const repository = dataSource.getRepository(UserBanEntity);
        const now = new Date();
        const entity = await repository
            .createQueryBuilder("ban")
            .leftJoinAndSelect("ban.user", "user")
            .leftJoinAndSelect("ban.bannedBy", "bannedBy")
            .where("ban.user = :userId", { userId })
            .andWhere("(ban.expiresAt IS NULL OR ban.expiresAt > :now)", { now })
            .orderBy("ban.bannedAt", "DESC")
            .getOne();
        return entity ? UserBan.from({
            id: entity.id,
            userId: entity.user.id,
            reason: entity.reason,
            bannedAt: entity.bannedAt,
            expiresAt: entity.expiresAt,
            bannedBy: entity.bannedBy.id,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        }) : null;
    }

    async unbanUser(userId: string): Promise<void> {
        const repository = dataSource.getRepository(UserBanEntity);
        const now = new Date();
        const activeBan = await repository
            .createQueryBuilder("ban")
            .leftJoinAndSelect("ban.user", "user")
            .where("ban.user = :userId", { userId })
            .andWhere("(ban.expiresAt IS NULL OR ban.expiresAt > :now)", { now })
            .orderBy("ban.bannedAt", "DESC")
            .getOne();
        if (activeBan) {
            activeBan.expiresAt = now;
            await repository.save(activeBan);
        }

        const userRepository = dataSource.getRepository(UserProfileEntity);
        const user = await userRepository.findOne({ where: { id: userId }, withDeleted: true });
        if (user) {
            await userRepository.restore(user.id);
        }
    }

    async getBansByUserId(userId: string): Promise<UserBan[]> {
        const repository = dataSource.getRepository(UserBanEntity);
        const entities = await repository.find({
            where: { user: { id: userId } },
            relations: ["user", "bannedBy"],
            order: { bannedAt: "DESC" },
        });
        return entities.map((userBan) => UserBan.from({
            id: userBan.id,
            userId: userBan.user.id,
            reason: userBan.reason,
            bannedAt: userBan.bannedAt,
            expiresAt: userBan.expiresAt,
            bannedBy: userBan.bannedBy.id,
            createdAt: userBan.createdAt,
            updatedAt: userBan.updatedAt,
        }));
    }

    async finishActiveBan(userId: string, finishedAt: Date): Promise<void> {
        const repository = dataSource.getRepository(UserBanEntity);
        const now = finishedAt;
        const activeBan = await repository
            .createQueryBuilder("ban")
            .leftJoinAndSelect("ban.user", "user")
            .where("ban.user = :userId", { userId })
            .andWhere("(ban.expiresAt IS NULL OR ban.expiresAt > :now)", { now })
            .orderBy("ban.bannedAt", "DESC")
            .getOne();
        if (activeBan) {
            activeBan.expiresAt = finishedAt;
            await repository.save(activeBan);
        }
    }
} 