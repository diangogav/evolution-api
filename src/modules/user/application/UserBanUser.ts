import { UserBanRepository } from "../domain/UserBanRepository";
import { UserBan } from "../domain/UserBan";
import { v4 as uuidv4 } from "uuid";

export class UserBanUser {
    constructor(private readonly userBanRepository: UserBanRepository) {}

    async execute(params: {
        userId: string;
        reason: string;
        bannedBy: string;
        expiresAt?: Date;
    }): Promise<void> {
        const now = new Date();
        await this.userBanRepository.finishActiveBan(params.userId, now);
        const ban = UserBan.create({
            id: uuidv4(),
            userId: params.userId,
            reason: params.reason,
            bannedAt: now,
            expiresAt: params.expiresAt,
            bannedBy: params.bannedBy,
            createdAt: now,
            updatedAt: now,
        });
        await this.userBanRepository.banUser(ban);
    }
} 