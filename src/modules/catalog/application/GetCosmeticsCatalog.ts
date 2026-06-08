import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { CosmeticRepository } from "../domain/CosmeticRepository";
import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

export interface CatalogCosmetic {
	id: string;
	type: CosmeticType;
	tier: CosmeticTier;
	displayName: string;
	assets: Record<string, string>;
}

export interface CatalogFilters {
	type?: CosmeticType;
	tier?: CosmeticTier;
}

export class GetCosmeticsCatalog {
	constructor(
		private readonly repository: CosmeticRepository,
		private readonly signer: AssetUrlSigner,
	) {}

	async run(filters: CatalogFilters = {}): Promise<CatalogCosmetic[]> {
		const cosmetics = await this.repository.findAll();

		const visible = cosmetics.filter(
			(cosmetic) =>
				cosmetic.active &&
				(filters.type === undefined || cosmetic.type === filters.type) &&
				(filters.tier === undefined || cosmetic.tier === filters.tier),
		);

		return Promise.all(
			visible.map(async (cosmetic) => ({
				id: cosmetic.id,
				type: cosmetic.type,
				tier: cosmetic.tier,
				displayName: cosmetic.displayName,
				assets: await this.signer.signManifest(cosmetic.assetRef),
			})),
		);
	}
}
