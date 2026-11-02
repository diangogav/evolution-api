import { UserBanRepository } from "../domain/UserBanRepository";
import { UserBan } from "../domain/UserBan";
import { NotFoundError } from "../../../shared/errors/NotFoundError";

export class UserBanUser {
	constructor(private readonly userBanRepository: UserBanRepository) {}

	async execute(params: {
		userId: string;
		reason: string;
		bannedBy: string;
		expiresAt?: Date;
	}): Promise<void> {
		const exists = await this.userBanRepository.userExists(params.userId);
		if (!exists) {
			throw new NotFoundError("User not found");
		}

		const now = new Date();
		await this.userBanRepository.finishActiveBan(params.userId, now);
		const ban = UserBan.create({
			id: crypto.randomUUID(),
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
