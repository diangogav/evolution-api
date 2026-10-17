import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

export interface StandardCosmeticSeed {
	type: CosmeticType;
	tier: CosmeticTier;
	assetRef: string;
	displayName: string;
}

// The cosmetic set seeded on bootstrap. asset_ref is the R2 folder prefix; the
// individual files (render.jpg for sleeves and avatars; background.webp, the
// low-poly stage, for playmats) live under it and are resolved at serve
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
	// Low-poly stages for the Pixi board: background.webp is the backdrop the
	// board paints behind the zones, the only basename the client reads. The old
	// glTF playmats (plaque, pallet-*) were deactivated in the database when the
	// 3D renderer was retired.
	// The arcane hall is also the client's bundled default; it is hosted here so a
	// logged-in player keeps it once the server catalog replaces the bundled list.
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/arcane/",
		displayName: "Salón arcano",
	},
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
	// Terrain without zones: the field comes from the separately equipped lane.
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/mossy-ruins/",
		displayName: "Ruinas de musgo",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/halloween-graveyard/",
		displayName: "Cementerio de Halloween",
	},
	// Lanes: the frame a player's zones wear, worn beside the playmat so any
	// stage pairs with any frame. Only painted lanes need a row — "engraved"
	// (the plaque the board generates) and "bare" (deliberately none) are
	// choices the client already ships.
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/stone/",
		displayName: "Losa de piedra",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/mossy-ruins/",
		displayName: "Piedra musgosa",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/arcane-bronze/",
		displayName: "Bronce arcano",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/forest-roots/",
		displayName: "Raíces del bosque",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/kagura-iron/",
		displayName: "Hierro de Kagura",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/pond-pebbles/",
		displayName: "Guijarros del estanque",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/halloween-bones/",
		displayName: "Huesos de Halloween",
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
