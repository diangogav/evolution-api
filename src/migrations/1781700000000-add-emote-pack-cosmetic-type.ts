import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the EMOTE_PACK cosmetic type: a folder of Lottie emotes described by a
 * `pack.json`, owned like any other cosmetic but never equipped in the loadout.
 *
 * No row is inserted here. `ALTER TYPE ... ADD VALUE` runs inside a
 * transaction on PG >= 12, but the freshly added value cannot be USED in that
 * same transaction.
 */
export class AddEmotePackCosmeticType1781700000000 implements MigrationInterface {
	name = "AddEmotePackCosmeticType1781700000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE "cosmetic_type_enum" ADD VALUE IF NOT EXISTS 'EMOTE_PACK'`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		// Postgres cannot remove a single enum value without recreating the whole
		// type and rewriting every column that uses it. Deleting the rows is the
		// reversible part; the value itself is left in place, inert.
		await queryRunner.query(`DELETE FROM "cosmetics" WHERE "type" = 'EMOTE_PACK'`);
	}
}
