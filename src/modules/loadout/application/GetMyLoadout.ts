import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { LoadoutRepository } from "../domain/LoadoutRepository";

export interface MyLoadoutSlot {
	cosmeticType: CosmeticType;
	cosmeticId: string;
	assets: Record<string, string>;
}

export class GetMyLoadout {
	constructor(
		private readonly loadouts: LoadoutRepository,
		private readonly cosmetics: CosmeticRepository,
		private readonly signer: AssetUrlSigner,
	) {}

	async run(userId: string): Promise<MyLoadoutSlot[]> {
		const loadout = await this.loadouts.findByUserId(userId);

		return Promise.all(
			loadout.items().map(async (item) => {
				const cosmetic = await this.cosmetics.findById(item.cosmeticId);
				return {
					cosmeticType: item.cosmeticType,
					cosmeticId: item.cosmeticId,
					assets: cosmetic ? await this.signer.signManifest(cosmetic.assetRef) : {},
				};
			}),
		);
	}
}
