import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
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
		private readonly gatekeeper: EntitlementsGatekeeper,
	) {}

	async run(filters: CatalogFilters = {}, userId?: string | null): Promise<CatalogCosmetic[]> {
		const cosmetics = await this.repository.findAll();

		// Resolve access once — O(1) repo fetch regardless of catalog size (RFC §8).
		const access = await this.gatekeeper.accessFor(userId ?? null);

		const visible = cosmetics.filter(
			(cosmetic) =>
				cosmetic.active &&
				access.canUse(cosmetic) &&
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
