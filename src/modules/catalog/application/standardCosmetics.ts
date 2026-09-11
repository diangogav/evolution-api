import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

export interface StandardCosmeticSeed {
	type: CosmeticType;
	tier: CosmeticTier;
	assetRef: string;
	displayName: string;
}

// The cosmetic set seeded on bootstrap. asset_ref is the R2 folder prefix; the
// individual files (render.jpg for sleeves and avatars; surface.webp, background.webp
// and theme.json for the painted 2D stages) live under it and are resolved at serve
// time. `tier` gates visibility/usage: anonymous players see STANDARD only;
// REGISTERED requires an account. NOTE: the seed only INSERTS missing rows (matched by
// asset_ref) — it never updates the tier of an already-seeded cosmetic, so changing an
// existing tier needs a data migration (see SetSleeveTiers).
export const STANDARD_COSMETICS: StandardCosmeticSeed[] = [
	{
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.REGISTERED,
		assetRef: "sleeves/baby-frog/",
		displayName: "Baby Frog",
	},
	{
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.STANDARD,
		assetRef: "sleeves/classic/",
		displayName: "Classic",
	},
	{
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.REGISTERED,
		assetRef: "sleeves/kagura/",
		displayName: "Kagura",
	},
	{
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.REGISTERED,
		assetRef: "sleeves/mystical-witch/",
		displayName: "Mystical Witch",
	},
	{
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.STANDARD,
		assetRef: "sleeves/evolution/",
		displayName: "Evolution",
	},
	{
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.STANDARD,
		assetRef: "sleeves/evolution-black/",
		displayName: "Evolution Black",
	},
	// Painted 2D stages for the DOM board: surface.webp (the player's half),
	// background.webp (the arena backdrop) and theme.json (the palette). The
	// client reads those three basenames. The old glTF playmats (plaque, pallet-*)
	// were deactivated in the database when the 3D renderer was retired.
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/kagura-castle/",
		displayName: "Castillo de Kagura",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/mystic-forest/",
		displayName: "Bosque místico",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/frog-pond/",
		displayName: "Estanque de la Rana",
	},
	{
		type: CosmeticType.AVATAR,
		tier: CosmeticTier.REGISTERED,
		assetRef: "avatars/baby-frog/",
		displayName: "Baby Frog",
	},
	{
		type: CosmeticType.AVATAR,
		tier: CosmeticTier.REGISTERED,
		assetRef: "avatars/kagura/",
		displayName: "Kagura",
	},
	{
		type: CosmeticType.AVATAR,
		tier: CosmeticTier.REGISTERED,
		assetRef: "avatars/mystical-witch/",
		displayName: "Mystical Witch",
	},
	{
		type: CosmeticType.AVATAR,
		tier: CosmeticTier.STANDARD,
		assetRef: "avatars/evolution/",
		displayName: "Evolution",
	},
	{
		type: CosmeticType.AVATAR,
		tier: CosmeticTier.STANDARD,
		assetRef: "avatars/evolution-black/",
		displayName: "Evolution Black",
	},
];
