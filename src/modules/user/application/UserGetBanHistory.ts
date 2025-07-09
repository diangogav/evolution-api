import { UserBanRepository } from "../domain/UserBanRepository";
import { UserBan } from "../domain/UserBan";

export class UserGetBanHistory {
    constructor(private readonly userBanRepository: UserBanRepository) {}

    async execute(userId: string): Promise<UserBan[]> {
        return this.userBanRepository.getBansByUserId(userId);
    }
} 