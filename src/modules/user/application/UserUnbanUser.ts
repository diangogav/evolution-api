import { UserBanRepository } from "../domain/UserBanRepository";

export class UserUnbanUser {
    constructor(private readonly userBanRepository: UserBanRepository) {}

    async execute(banId: string): Promise<void> {
        await this.userBanRepository.unbanUser(banId);
    }
} 