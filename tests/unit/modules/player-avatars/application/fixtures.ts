import { AvatarConfig } from "../../../../../src/modules/player-avatars/domain/AvatarConfig";
import { PlayerAvatarRepository } from "../../../../../src/modules/player-avatars/domain/PlayerAvatarRepository";

export class InMemoryPlayerAvatarRepository implements PlayerAvatarRepository {
	readonly rows = new Map<string, AvatarConfig>();
	lookups: (readonly string[])[] = [];

	async findByUserId(userId: string) {
		return this.rows.get(userId) ?? null;
	}

	async findByUserIds(userIds: readonly string[]) {
		this.lookups.push(userIds);
		const found = new Map<string, AvatarConfig>();
		for (const id of userIds) {
			const config = this.rows.get(id);
			if (config) found.set(id, config);
		}
		return found;
	}

	async save(userId: string, config: AvatarConfig) {
		this.rows.set(userId, config);
	}

	async delete(userId: string) {
		this.rows.delete(userId);
	}
}
