import type { CompanionAnimationDescriptor } from "../domain/CompanionAnimation";
import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

export interface StandardCosmeticSeed {
	type: CosmeticType;
	tier: CosmeticTier;
	assetRef: string;
	displayName: string;
	// Only COMPANION assets carry an animation descriptor; left undefined for every
	// other type (enforced by Cosmetic.create).
	animation?: CompanionAnimationDescriptor;
}

// KayKit companion characters. The animation descriptor uses the external-rig strategy:
// the character .glb is self-contained, and the manifest (character.glb + rig.glb +
// preview.jpg) is built at request time from the R2 prefix, so the seed only stores the
// assetRef plus this descriptor. Clip names and the rig basename are validated against
// the real KayKit files.
const COMPANION_ANIMATION: CompanionAnimationDescriptor = {
	rigFile: "Rig_Medium_General.glb",
	clips: {
		idle: "Idle_A",
		spawn: "Spawn_Ground",
		speak: "Interact",
		hit: "Hit_A",
		summon: "Use_Item",
		attack: "Throw",
		cast: "Use_Item",
		defeat: "Death_A",
	},
};

export const KAYKIT_COMPANIONS: StandardCosmeticSeed[] = [
	{
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.STANDARD,
		assetRef: "companions/kaykit-warrior/",
		displayName: "Warrior",
		animation: COMPANION_ANIMATION,
	},
	{
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.STANDARD,
		assetRef: "companions/kaykit-rogue/",
		displayName: "Rogue",
		animation: COMPANION_ANIMATION,
	},
	{
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.STANDARD,
		assetRef: "companions/kaykit-minion/",
		displayName: "Minion",
		animation: COMPANION_ANIMATION,
	},
	// Mage is the client's bundled offline default (STANDARD_COMPANION). It is still hosted
	// server-side so a player can equip it explicitly and opponents/spectators see it through
	// the public loadout, exactly like the other companions.
	{
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.STANDARD,
		assetRef: "companions/kaykit-mage/",
		displayName: "Mage",
		animation: COMPANION_ANIMATION,
	},
];

// Terminator — first EXCLUSIVE companion. Uses its own animation (not the shared KayKit
// descriptor).
// WARNING: the seed is INSERT-ONLY (matched by asset_ref) — it never updates an already
// seeded row. So the clip names and rigFile below must be the REAL animation-group names
// from the Terminator .glb BEFORE the first seed run; fixing them afterwards needs a data
// migration. The placeholders are marked TODO on purpose.
const TERMINATOR_ANIMATION: CompanionAnimationDescriptor = {
	rigFile: "TODO_terminator_rig.glb", // TODO: real external rig basename
	clips: {
		idle: "TODO_idle",
		spawn: "TODO_spawn",
		speak: "TODO_speak",
		hit: "TODO_hit",
		summon: "TODO_summon",
		attack: "TODO_attack",
		cast: "TODO_cast",
		defeat: "TODO_defeat",
	},
};

export const EXCLUSIVE_COMPANIONS: StandardCosmeticSeed[] = [
	{
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.EXCLUSIVE,
		assetRef: "companions/terminator/",
		displayName: "Terminator",
		animation: TERMINATOR_ANIMATION,
	},
];

// The cosmetic set seeded on bootstrap. asset_ref is the R2 folder prefix; the
// individual files (render/preview for sleeves, gltf/bin/texture for playmats,
// character.glb/rig.glb/preview.jpg for companions) live under it and are resolved at
// serve time. `tier` gates visibility/usage: anonymous players see STANDARD only;
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
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/pallet-covered-a/",
		displayName: "Pallet Covered A",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/pallet-covered-b/",
		displayName: "Pallet Covered B",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/pallet-wood/",
		displayName: "Pallet Wood",
	},
	{
		type: CosmeticType.PLAYMAT,
		tier: CosmeticTier.STANDARD,
		assetRef: "playmats/plaque/",
		displayName: "Plaque",
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
	// Companions are live now that their assets are uploaded to R2.
	...KAYKIT_COMPANIONS,
	// Exclusive companions: EXCLUSIVE tier is granted by NO user tier, so these are only
	// obtainable through a per-user COSMETIC entitlement (see scripts/assign-cosmetic.ts).
	...EXCLUSIVE_COMPANIONS,
];
