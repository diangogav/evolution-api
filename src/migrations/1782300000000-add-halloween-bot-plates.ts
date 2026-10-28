import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Zone plates (LANE cosmetics) that match the Halloween horde bot playmats. Like the rest of
 * the bots' looks they are inactive catalog rows: no player can own them, while the bot
 * loadout still signs their plate.json.
 */
export const HALLOWEEN_BOT_PLATES: readonly {
	id: string;
	displayName: string;
	bots: readonly string[];
}[] = [
	{
		id: "halloween-wave-easy",
		displayName: "Veil Cemetery Plate",
		bots: ["Haunted", "Skeletons", "Horde"],
	},
	{
		id: "halloween-wave-medium",
		displayName: "Candle Crypt Plate",
		bots: ["Archfiends", "Vampires", "Witches"],
	},
	{
		id: "halloween-wave-hard",
		displayName: "Ember Ruins Plate",
		bots: ["DarkWorld", "CursedGarden", "Necromancer"],
	},
	{ id: "halloween-lich", displayName: "Frost Throne Plate", bots: ["Lich"] },
	{ id: "halloween-gravekeepers", displayName: "Sealed Necropolis Plate", bots: ["Gravekeepers"] },
];

const assetRef = (id: string) => `lanes/${id}/`;

const INSERT_PLATES = `INSERT INTO "cosmetics" ("type", "tier", "asset_ref", "display_name", "active", "asset_files")
SELECT 'LANE'::cosmetic_type_enum, 'EXCLUSIVE'::cosmetic_tier_enum, plate.asset_ref, plate.display_name, false, ARRAY['plate.json']
FROM unnest($1::varchar[], $2::varchar[]) AS plate(asset_ref, display_name)
ON CONFLICT ("asset_ref") DO NOTHING`;

const UPSERT_LOOKS = `INSERT INTO "bot_loadouts" ("bot_name", "cosmetic_type", "cosmetic_id")
SELECT look.bot_name, c."type", c."id"
FROM unnest($1::varchar[], $2::varchar[]) AS look(bot_name, asset_ref)
JOIN "cosmetics" c ON c."asset_ref" = look.asset_ref
ON CONFLICT ("bot_name", "cosmetic_type") DO UPDATE SET "cosmetic_id" = EXCLUDED."cosmetic_id", "updated_at" = now()`;

const DELETE_LOOKS = `DELETE FROM "bot_loadouts" bl
USING unnest($1::varchar[], $2::varchar[]) AS look(bot_name, asset_ref), "cosmetics" c
WHERE c."asset_ref" = look.asset_ref AND bl."bot_name" = look.bot_name AND bl."cosmetic_id" = c."id"`;

// Only the rows this migration created: a published cosmetic sharing an asset_ref is active.
const DELETE_PLATES = `DELETE FROM "cosmetics" WHERE "asset_ref" = ANY($1::varchar[]) AND "active" = false`;

function lookParams(): [string[], string[]] {
	const looks = HALLOWEEN_BOT_PLATES.flatMap((plate) =>
		plate.bots.map((botName) => ({ botName, assetRef: assetRef(plate.id) })),
	);
	return [looks.map((look) => look.botName), looks.map((look) => look.assetRef)];
}

export class AddHalloweenBotPlates1782300000000 implements MigrationInterface {
	name = "AddHalloweenBotPlates1782300000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(INSERT_PLATES, [
			HALLOWEEN_BOT_PLATES.map((plate) => assetRef(plate.id)),
			HALLOWEEN_BOT_PLATES.map((plate) => plate.displayName),
		]);
		await queryRunner.query(UPSERT_LOOKS, lookParams());
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(DELETE_LOOKS, lookParams());
		await queryRunner.query(DELETE_PLATES, [
			HALLOWEEN_BOT_PLATES.map((plate) => assetRef(plate.id)),
		]);
	}
}
