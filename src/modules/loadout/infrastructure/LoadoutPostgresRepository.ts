import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { Loadout } from "../domain/Loadout";
import { LoadoutRepository } from "../domain/LoadoutRepository";
import { UserLoadoutEntity } from "./UserLoadoutEntity";

export class LoadoutPostgresRepository implements LoadoutRepository {
	async findByUserId(userId: string): Promise<Loadout> {
		const repository = cosmeticsDataSource.getRepository(UserLoadoutEntity);
		const rows = await repository.find({ where: { userId } });

		return Loadout.from(
			userId,
			rows.map((row) => ({ cosmeticType: row.cosmeticType, cosmeticId: row.cosmeticId })),
		);
	}

	async save(loadout: Loadout): Promise<void> {
		const repository = cosmeticsDataSource.getRepository(UserLoadoutEntity);
		const entities = loadout.items().map((item) =>
			repository.create({
				userId: loadout.userId,
				cosmeticType: item.cosmeticType,
				cosmeticId: item.cosmeticId,
			}),
		);

		if (entities.length === 0) {
			return;
		}

		// Upsert by the composite primary key (user_id, cosmetic_type).
		await repository.save(entities);
	}
}
