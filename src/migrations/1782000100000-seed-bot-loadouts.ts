import type { MigrationInterface, QueryRunner } from "typeorm";

/** Themed looks for the main bots, resolved against the catalog by asset_ref. */
export const BOT_LOADOUT_SEED: readonly { botName: string; assetRef: string }[] = [
	{ botName: "Lich", assetRef: "avatars/halloween-graveyard/" },
	{ botName: "Lich", assetRef: "sleeves/halloween-graveyard/" },
	{ botName: "Gravekeepers", assetRef: "playmats/halloween-graveyard/" },
	{ botName: "Gravekeepers", assetRef: "ambience/graveyard-bats/" },
];

// The inner join skips a seed row whose cosmetic is not in this catalog, so the
// migration never fails on an environment that lacks it. The slot comes from the
// cosmetic's own type, and an existing row for a slot is left untouched.
const INSERT_SEED = `INSERT INTO "bot_loadouts" ("bot_name", "cosmetic_type", "cosmetic_id")
SELECT seed.bot_name, c."type", c."id"
FROM unnest($1::varchar[], $2::varchar[]) AS seed(bot_name, asset_ref)
JOIN "cosmetics" c ON c."asset_ref" = seed.asset_ref
ON CONFLICT ("bot_name", "cosmetic_type") DO NOTHING`;

const DELETE_SEED = `DELETE FROM "bot_loadouts" bl
USING unnest($1::varchar[], $2::varchar[]) AS seed(bot_name, asset_ref), "cosmetics" c
WHERE c."asset_ref" = seed.asset_ref AND bl."bot_name" = seed.bot_name AND bl."cosmetic_id" = c."id"`;

function seedParams(): [string[], string[]] {
	return [BOT_LOADOUT_SEED.map((row) => row.botName), BOT_LOADOUT_SEED.map((row) => row.assetRef)];
}

export class SeedBotLoadouts1782000100000 implements MigrationInterface {
	name = "SeedBotLoadouts1782000100000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(INSERT_SEED, seedParams());
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(DELETE_SEED, seedParams());
	}
}
