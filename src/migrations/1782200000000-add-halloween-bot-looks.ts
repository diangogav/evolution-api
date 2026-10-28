import type { MigrationInterface, QueryRunner } from "typeorm";

type BotCosmetic = {
	assetRef: string;
	type: "AVATAR" | "SLEEVE" | "PLAYMAT";
	displayName: string;
	assetFiles: string[];
};

const avatar = (id: string, displayName: string): BotCosmetic => ({
	assetRef: `avatars/${id}/`,
	type: "AVATAR",
	displayName,
	assetFiles: ["render.jpg"],
});
const sleeve = (id: string, displayName: string): BotCosmetic => ({
	assetRef: `sleeves/${id}/`,
	type: "SLEEVE",
	displayName,
	assetFiles: ["render.jpg"],
});
const playmat = (id: string, displayName: string): BotCosmetic => ({
	assetRef: `playmats/${id}/`,
	type: "PLAYMAT",
	displayName,
	assetFiles: ["background.webp"],
});

/**
 * Looks of the Halloween horde bots. They are inactive catalog rows: no player can see,
 * buy or equip them, while the public bot loadout still signs their assets.
 */
export const HALLOWEEN_BOT_COSMETICS: readonly BotCosmetic[] = [
	avatar("bot-horde", "Zombie Horde"),
	avatar("bot-haunted", "Haunted House"),
	avatar("bot-skeletons", "Skeleton Knight"),
	avatar("bot-vampires", "Vampire Noble"),
	avatar("bot-witches", "Coven Witch"),
	avatar("bot-archfiends", "Archfiend"),
	avatar("bot-dark-world", "Shadow Prince"),
	avatar("bot-cursed-garden", "Cursed Bloom"),
	avatar("bot-necromancer", "Necromancer"),
	avatar("bot-lich", "Lich King"),
	avatar("bot-gravekeepers", "Gravekeeper Chief"),
	sleeve("halloween-wave-easy", "Veil Cemetery Sleeve"),
	sleeve("halloween-wave-medium", "Candle Crypt Sleeve"),
	sleeve("halloween-wave-hard", "Ember Ruins Sleeve"),
	sleeve("halloween-lich", "Frost Throne Sleeve"),
	sleeve("halloween-gravekeepers", "Sealed Necropolis Sleeve"),
	playmat("halloween-wave-easy", "Veil Cemetery Playmat"),
	playmat("halloween-wave-medium", "Candle Crypt Playmat"),
	playmat("halloween-wave-hard", "Ember Ruins Playmat"),
	playmat("halloween-lich", "Frost Throne Playmat"),
	playmat("halloween-gravekeepers", "Sealed Necropolis Playmat"),
];

// WindBot names of the event rivals: each wears its own avatar and its tier's sleeve and
// playmat; the two bosses have their own sleeve and playmat.
const TIER_LOOKS: readonly { bots: readonly [string, string][]; look: string }[] = [
	{
		look: "halloween-wave-easy",
		bots: [
			["Haunted", "bot-haunted"],
			["Skeletons", "bot-skeletons"],
			["Horde", "bot-horde"],
		],
	},
	{
		look: "halloween-wave-medium",
		bots: [
			["Archfiends", "bot-archfiends"],
			["Vampires", "bot-vampires"],
			["Witches", "bot-witches"],
		],
	},
	{
		look: "halloween-wave-hard",
		bots: [
			["DarkWorld", "bot-dark-world"],
			["CursedGarden", "bot-cursed-garden"],
			["Necromancer", "bot-necromancer"],
		],
	},
	{ look: "halloween-lich", bots: [["Lich", "bot-lich"]] },
	{ look: "halloween-gravekeepers", bots: [["Gravekeepers", "bot-gravekeepers"]] },
];

export const HALLOWEEN_BOT_LOOKS: readonly { botName: string; assetRef: string }[] =
	TIER_LOOKS.flatMap(({ bots, look }) =>
		bots.flatMap(([botName, avatarId]) => [
			{ botName, assetRef: `avatars/${avatarId}/` },
			{ botName, assetRef: `sleeves/${look}/` },
			{ botName, assetRef: `playmats/${look}/` },
		]),
	);

// The prize cosmetics the bosses wore before they had their own art (seeded by
// 1782100100000). Gravekeepers keeps the prize ambience: no bot ambience exists.
const REPLACED_BOSS_LOOKS: readonly { botName: string; assetRef: string }[] = [
	{ botName: "Lich", assetRef: "avatars/halloween-graveyard/" },
	{ botName: "Lich", assetRef: "sleeves/halloween-graveyard/" },
	{ botName: "Gravekeepers", assetRef: "playmats/halloween-graveyard/" },
];

const INSERT_COSMETICS = `INSERT INTO "cosmetics" ("type", "tier", "asset_ref", "display_name", "active", "asset_files")
SELECT row.type::cosmetic_type_enum, 'EXCLUSIVE'::cosmetic_tier_enum, row.asset_ref, row.display_name, false,
	string_to_array(row.asset_files, ',')
FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[]) AS row(asset_ref, type, display_name, asset_files)
ON CONFLICT ("asset_ref") DO NOTHING`;

// A bot keeps one cosmetic per slot, so its new look replaces whatever it wore.
const UPSERT_LOOKS = `INSERT INTO "bot_loadouts" ("bot_name", "cosmetic_type", "cosmetic_id")
SELECT look.bot_name, c."type", c."id"
FROM unnest($1::varchar[], $2::varchar[]) AS look(bot_name, asset_ref)
JOIN "cosmetics" c ON c."asset_ref" = look.asset_ref
ON CONFLICT ("bot_name", "cosmetic_type") DO UPDATE SET "cosmetic_id" = EXCLUDED."cosmetic_id", "updated_at" = now()`;

const DELETE_LOOKS = `DELETE FROM "bot_loadouts" bl
USING unnest($1::varchar[], $2::varchar[]) AS look(bot_name, asset_ref), "cosmetics" c
WHERE c."asset_ref" = look.asset_ref AND bl."bot_name" = look.bot_name AND bl."cosmetic_id" = c."id"`;

const RESTORE_BOSS_LOOKS = `INSERT INTO "bot_loadouts" ("bot_name", "cosmetic_type", "cosmetic_id")
SELECT look.bot_name, c."type", c."id"
FROM unnest($1::varchar[], $2::varchar[]) AS look(bot_name, asset_ref)
JOIN "cosmetics" c ON c."asset_ref" = look.asset_ref
ON CONFLICT ("bot_name", "cosmetic_type") DO NOTHING`;

// Only the rows this migration created: a published cosmetic sharing an asset_ref is active.
const DELETE_COSMETICS = `DELETE FROM "cosmetics" WHERE "asset_ref" = ANY($1::varchar[]) AND "active" = false`;

function lookParams(rows: readonly { botName: string; assetRef: string }[]): [string[], string[]] {
	return [rows.map((row) => row.botName), rows.map((row) => row.assetRef)];
}

export class AddHalloweenBotLooks1782200000000 implements MigrationInterface {
	name = "AddHalloweenBotLooks1782200000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(INSERT_COSMETICS, [
			HALLOWEEN_BOT_COSMETICS.map((row) => row.assetRef),
			HALLOWEEN_BOT_COSMETICS.map((row) => row.type),
			HALLOWEEN_BOT_COSMETICS.map((row) => row.displayName),
			HALLOWEEN_BOT_COSMETICS.map((row) => row.assetFiles.join(",")),
		]);
		await queryRunner.query(UPSERT_LOOKS, lookParams(HALLOWEEN_BOT_LOOKS));
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(DELETE_LOOKS, lookParams(HALLOWEEN_BOT_LOOKS));
		await queryRunner.query(RESTORE_BOSS_LOOKS, lookParams(REPLACED_BOSS_LOOKS));
		await queryRunner.query(DELETE_COSMETICS, [HALLOWEEN_BOT_COSMETICS.map((row) => row.assetRef)]);
	}
}
