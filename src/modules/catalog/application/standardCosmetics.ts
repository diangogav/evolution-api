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
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/desert-temple/",
		displayName: "Templo del desierto",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/frozen-sanctuary/",
		displayName: "Santuario helado",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/sakura-garden/",
		displayName: "Jardín de sakura",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/volcanic-forge/",
		displayName: "Forja volcánica",
	},
	// Lanes: the zone plate a player's zones wear, worn beside the playmat so any
	// stage pairs with any plate. A plate is a plate.json of colours the board
	// draws procedurally — no image files. Only coloured plates need a row: the
	// standard plate is the board's own default, tinted per seat, and lives in
	// the client. This seed only inserts: rows from earlier lane sets stay in
	// the database until deactivated there.
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/bronze/",
		displayName: "Bronce",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/moss/",
		displayName: "Musgo",
	},
	{
		type: CosmeticType.LANE,
		tier: CosmeticTier.STANDARD,
		assetRef: "lanes/ice/",
		displayName: "Hielo",
	},
	// Ambience: drifting motes and a light sweep over the stage, drawn from an
	// ambience.json with no image files. The meadow default lives in the client
	// like the standard plate, so it has no row.
	{
		type: CosmeticType.AMBIENCE,
		tier: CosmeticTier.STANDARD,
		assetRef: "ambience/embers/",
		displayName: "Brasas",
	},
	{
		type: CosmeticType.AMBIENCE,
		tier: CosmeticTier.STANDARD,
		assetRef: "ambience/snowfall/",
		displayName: "Nevada",
	},
	{
		type: CosmeticType.AMBIENCE,
		tier: CosmeticTier.STANDARD,
		assetRef: "ambience/petals/",
		displayName: "Pétalos",
	},
	{
		type: CosmeticType.AMBIENCE,
		tier: CosmeticTier.STANDARD,
		assetRef: "ambience/graveyard-bats/",
		displayName: "Murciélagos del cementerio",
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
