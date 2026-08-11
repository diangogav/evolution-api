import type { CosmeticRepository } from "../domain/CosmeticRepository";
import type { CosmeticTier } from "../domain/CosmeticTier";
import type { CosmeticType } from "../domain/CosmeticType";

export interface AdminCosmeticDto {
	readonly id: string;
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	readonly active: boolean;
	readonly assetFiles: readonly string[];
}

export class GetAdminCosmetics {
	constructor(private readonly cosmetics: CosmeticRepository) {}

	async run(): Promise<AdminCosmeticDto[]> {
		const cosmetics = await this.cosmetics.findAll();
		return cosmetics
			.map((cosmetic) => ({
				id: cosmetic.id,
				type: cosmetic.type,
				tier: cosmetic.tier,
				assetRef: cosmetic.assetRef,
				displayName: cosmetic.displayName,
				active: cosmetic.active,
				assetFiles: cosmetic.assetFiles ?? [],
			}))
			.sort((left, right) => left.displayName.localeCompare(right.displayName));
	}
}
