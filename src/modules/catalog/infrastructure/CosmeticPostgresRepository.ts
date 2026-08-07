import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { Cosmetic } from "../domain/Cosmetic";
import { CosmeticRepository } from "../domain/CosmeticRepository";
import { CosmeticEntity } from "./CosmeticEntity";

// The id column is uuid; querying it with a malformed value makes Postgres throw
// `invalid input syntax for type uuid`, which would surface as a 500. A non-uuid id
// can never match a row, so we treat it as "not found" and skip the query entirely.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
				animation: entity.animation ?? undefined,
				assetFiles: entity.assetFiles,
			}),
		);
	}

	async findById(id: string): Promise<Cosmetic | null> {
		if (!UUID_PATTERN.test(id)) {
			return null;
		}

		const repository = cosmeticsDataSource.getRepository(CosmeticEntity);
		const entity = await repository.findOne({ where: { id } });

		if (!entity) {
			return null;
		}

		return Cosmetic.from({
			id: entity.id,
			type: entity.type,
			tier: entity.tier,
			assetRef: entity.assetRef,
			displayName: entity.displayName,
			active: entity.active,
			animation: entity.animation ?? undefined,
			assetFiles: entity.assetFiles,
		});
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
			animation: data.animation ?? null,
			assetFiles: data.assetFiles ? [...data.assetFiles] : null,
		});

		await repository.save(entity);
	}
}
