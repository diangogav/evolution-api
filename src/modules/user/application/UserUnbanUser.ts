import { UserBanRepository } from "../domain/UserBanRepository";

export class UserUnbanUser {
    constructor(private readonly userBanRepository: UserBanRepository) {}

    async execute(userId: string): Promise<void> {
        await this.userBanRepository.unbanUser(userId);
    }
} 