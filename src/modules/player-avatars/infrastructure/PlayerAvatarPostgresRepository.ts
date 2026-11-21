import { In } from "typeorm";

import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { AvatarConfig, isAvatarConfig } from "../domain/AvatarConfig";
import { PlayerAvatarRepository } from "../domain/PlayerAvatarRepository";
import { PlayerAvatarEntity } from "./PlayerAvatarEntity";

export class PlayerAvatarPostgresRepository implements PlayerAvatarRepository {
	async findByUserId(userId: string): Promise<AvatarConfig | null> {
		const row = await cosmeticsDataSource.getRepository(PlayerAvatarEntity).findOneBy({ userId });
		return row && isAvatarConfig(row.config) ? row.config : null;
	}

	async findByUserIds(userIds: readonly string[]): Promise<ReadonlyMap<string, AvatarConfig>> {
		const found = new Map<string, AvatarConfig>();
		if (userIds.length === 0) return found;
		const rows = await cosmeticsDataSource
			.getRepository(PlayerAvatarEntity)
			.findBy({ userId: In([...userIds]) });
		for (const row of rows) {
			if (isAvatarConfig(row.config)) found.set(row.userId, row.config);
		}
		return found;
	}

	async save(userId: string, config: AvatarConfig): Promise<void> {
		// One INSERT ... ON CONFLICT (user_id) DO UPDATE, so two first saves for a user cannot
		// collide on the primary key.
		await cosmeticsDataSource
			.createQueryBuilder()
			.insert()
			.into(PlayerAvatarEntity)
			.values({ userId, config })
			.orUpdate(["config", "updated_at"], ["user_id"])
			.execute();
	}

	async delete(userId: string): Promise<void> {
		await cosmeticsDataSource.getRepository(PlayerAvatarEntity).delete({ userId });
	}
}
