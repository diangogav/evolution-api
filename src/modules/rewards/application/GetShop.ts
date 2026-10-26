import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { CosmeticTier } from "../../catalog/domain/CosmeticTier";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { ShopCatalogRepository } from "../domain/ShopCatalogRepository";

export type ShopItemView = {
	id: string;
	type: CosmeticType;
	tier: CosmeticTier;
	displayName: string;
	price: number;
	owned: boolean;
	assets: Record<string, string>;
	assetsExpiresAt: string;
};

// "owned" is decided by the gatekeeper, the same gate that decides equipping: a tier
// the user already holds counts as owned, so nobody is sold what they can already use.
// Each item carries its own signed assets: an item for sale is by definition one the
// user cannot use yet, so the cosmetics asset endpoints (gated by use) would refuse it.
export class GetShop {
	constructor(
		private readonly shop: ShopCatalogRepository,
		private readonly gatekeeper: Pick<EntitlementsGatekeeper, "accessFor">,
		private readonly signer: Pick<AssetUrlSigner, "signManifest">,
	) {}

	async run(userId: string): Promise<ShopItemView[]> {
		const [items, access] = await Promise.all([
			this.shop.findPurchasable(),
			this.gatekeeper.accessFor(userId),
		]);
		return Promise.all(
			items.map(async (item) => {
				const signed = await this.signer.signManifest(item.assetRef, item.assetFiles ?? undefined);
				return {
					id: item.id,
					type: item.type,
					tier: item.tier,
					displayName: item.displayName,
					price: item.essencePrice,
					owned: access.canUse(item),
					assets: signed.assets,
					assetsExpiresAt: signed.expiresAt,
				};
			}),
		);
	}
}
