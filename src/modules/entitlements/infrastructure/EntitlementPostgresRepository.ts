import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { Entitlement } from "../domain/Entitlement";
import { EntitlementRepository } from "../domain/EntitlementRepository";
import { EntitlementEntity } from "./EntitlementEntity";

export class EntitlementPostgresRepository implements EntitlementRepository {
	async findByUserId(userId: string): Promise<Entitlement[]> {
		const repository = cosmeticsDataSource.getRepository(EntitlementEntity);
		const rows = await repository.find({ where: { userId } });

		return rows.map((row) =>
			Entitlement.from({
				id: row.id,
				userId: row.userId,
				grantType: row.grantType,
				grantValue: row.grantValue,
				source: row.source,
				expiresAt: row.expiresAt,
			}),
		);
	}

	async save(entitlement: Entitlement): Promise<void> {
		const repository = cosmeticsDataSource.getRepository(EntitlementEntity);
		const data = entitlement.toPrimitives();

		const entity = repository.create({
			id: data.id,
			userId: data.userId,
			grantType: data.grantType,
			grantValue: data.grantValue,
			source: data.source,
			expiresAt: data.expiresAt,
		});

		await repository.save(entity);
	}
}
