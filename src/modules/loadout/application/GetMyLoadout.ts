import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { LoadoutItem } from "../domain/Loadout";
import { LoadoutRepository } from "../domain/LoadoutRepository";

export interface MyLoadoutSlot {
	cosmeticType: CosmeticType;
	cosmeticId: string;
	assets: Record<string, string>;
	assetsExpiresAt?: string | null;
}

export class GetMyLoadout {
	constructor(
		private readonly loadouts: LoadoutRepository,
		private readonly cosmetics: CosmeticRepository,
		private readonly signer: AssetUrlSigner,
	) {}

	async run(userId: string): Promise<MyLoadoutSlot[]> {
		const loadout = await this.loadouts.findByUserId(userId);

		return this.signSlots(loadout.items());
	}

	// Signs every equipped slot it is given without an entitlement check: whoever equipped
	// the item was already allowed to, so a public view (a rival, a bot) signs it as well.
	async signSlots(items: LoadoutItem[]): Promise<MyLoadoutSlot[]> {
		return Promise.all(
			items.map(async (item) => {
				const cosmetic = await this.cosmetics.findById(item.cosmeticId);
				const signedManifest = cosmetic
					? await this.signer.signManifest(cosmetic.assetRef, cosmetic.assetFiles ?? undefined)
					: undefined;
				return {
					cosmeticType: item.cosmeticType,
					cosmeticId: item.cosmeticId,
					assets: signedManifest?.assets ?? {},
					assetsExpiresAt: signedManifest?.expiresAt,
				};
			}),
		);
	}
}
