import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { Cosmetic } from "../domain/Cosmetic";
import { CosmeticRepository } from "../domain/CosmeticRepository";
import { CosmeticEntity } from "./CosmeticEntity";

export class CosmeticPostgresRepository implements CosmeticRepository {
	async findAll(): Promise<Cosmetic[]> {
		const repository = cosmeticsDataSource.getRepository(CosmeticEntity);
		const entities = await repository.find();

		return entities.map((entity) =>
			Cosmetic.from({
				id: entity.id,
				type: entity.type,
				tier: entity.tier,
				assetRef: entity.assetRef,
				displayName: entity.displayName,
				active: entity.active,
			}),
		);
	}

	async save(cosmetic: Cosmetic): Promise<void> {
		const repository = cosmeticsDataSource.getRepository(CosmeticEntity);
		const data = cosmetic.toPrimitives();

		const entity = repository.create({
			id: data.id,
			type: data.type,
			tier: data.tier,
			assetRef: data.assetRef,
			displayName: data.displayName,
			active: data.active,
		});

		await repository.save(entity);
	}
}
