import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

export interface StandardCosmeticSeed {
	type: CosmeticType;
	tier: CosmeticTier;
	assetRef: string;
	displayName: string;
}

// The standard set every player gets. asset_ref is the R2 folder prefix; the
// individual files (render/preview for sleeves, gltf/bin/texture for playmats)
// live under it and are resolved at serve time.
export const STANDARD_COSMETICS: StandardCosmeticSeed[] = [
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/baby-frog/", displayName: "Baby Frog" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/classic/", displayName: "Classic" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/kagura/", displayName: "Kagura" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/mystical-witch/", displayName: "Mystical Witch" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/pallet-covered-a/", displayName: "Pallet Covered A" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/pallet-covered-b/", displayName: "Pallet Covered B" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/pallet-wood/", displayName: "Pallet Wood" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/plaque/", displayName: "Plaque" },
];
