import { UserBanRepository } from "../domain/UserBanRepository";
import { UserBan } from "../domain/UserBan";

export class UserGetActiveBan {
    constructor(private readonly userBanRepository: UserBanRepository) {}

    async execute(userId: string): Promise<UserBan | null> {
        return this.userBanRepository.findActiveBanByUserId(userId);
    }
} 