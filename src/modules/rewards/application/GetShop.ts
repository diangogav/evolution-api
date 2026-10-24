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
};

// "owned" is decided by the gatekeeper, the same gate that decides equipping: a tier
// the user already holds counts as owned, so nobody is sold what they can already use.
export class GetShop {
	constructor(
		private readonly shop: ShopCatalogRepository,
		private readonly gatekeeper: Pick<EntitlementsGatekeeper, "canUse">,
	) {}

	async run(userId: string): Promise<ShopItemView[]> {
		const items = await this.shop.findPurchasable();
		return Promise.all(
			items.map(async (item) => ({
				id: item.id,
				type: item.type,
				tier: item.tier,
				displayName: item.displayName,
				price: item.essencePrice,
				owned: await this.gatekeeper.canUse(userId, item),
			})),
		);
	}
}
