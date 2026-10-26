import { CosmeticTier } from "../../catalog/domain/CosmeticTier";
import { CosmeticType } from "../../catalog/domain/CosmeticType";

// A cosmetic as the shop sees it: active and carrying an essence price. Cosmetics
// without a price (STANDARD, REGISTERED, hand-granted EXCLUSIVE) are not for sale.
export type ShopCosmetic = {
	id: string;
	type: CosmeticType;
	tier: CosmeticTier;
	displayName: string;
	essencePrice: number;
	/** R2 prefix and published files, so the shop can sign previews of what it sells. */
	assetRef: string;
	assetFiles: string[] | null;
};

export interface ShopCatalogRepository {
	findPurchasable(): Promise<ShopCosmetic[]>;
	findPurchasableById(cosmeticId: string): Promise<ShopCosmetic | null>;
}
