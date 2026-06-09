import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

export interface StandardCosmeticSeed {
	type: CosmeticType;
	tier: CosmeticTier;
	assetRef: string;
	displayName: string;
}

// The cosmetic set seeded on bootstrap. asset_ref is the R2 folder prefix; the
// individual files (render/preview for sleeves, gltf/bin/texture for playmats)
// live under it and are resolved at serve time. `tier` gates visibility/usage:
// anonymous players see STANDARD only; REGISTERED requires an account. NOTE: the
// seed only INSERTS missing rows (matched by asset_ref) — it never updates the
// tier of an already-seeded cosmetic, so changing an existing tier needs a
// data migration (see SetSleeveTiers).
export const STANDARD_COSMETICS: StandardCosmeticSeed[] = [
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.REGISTERED, assetRef: "sleeves/baby-frog/", displayName: "Baby Frog" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/classic/", displayName: "Classic" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.REGISTERED, assetRef: "sleeves/kagura/", displayName: "Kagura" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.REGISTERED, assetRef: "sleeves/mystical-witch/", displayName: "Mystical Witch" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/evolution/", displayName: "Evolution" },
	{ type: CosmeticType.SLEEVE, tier: CosmeticTier.STANDARD, assetRef: "sleeves/evolution-black/", displayName: "Evolution Black" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/pallet-covered-a/", displayName: "Pallet Covered A" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/pallet-covered-b/", displayName: "Pallet Covered B" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/pallet-wood/", displayName: "Pallet Wood" },
	{ type: CosmeticType.PLAYMAT, tier: CosmeticTier.STANDARD, assetRef: "playmats/plaque/", displayName: "Plaque" },
];
