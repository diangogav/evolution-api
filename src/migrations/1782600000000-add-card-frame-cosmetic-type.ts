import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the CARD_FRAME cosmetic type: a layered kit the client composes cards
 * from.
 *
 * No row is inserted here. `ALTER TYPE ... ADD VALUE` runs inside a
 * transaction on PG >= 12, but the freshly added value cannot be USED in that
 * same transaction; frames are published through the admin endpoint instead.
 */
export class AddCardFrameCosmeticType1782600000000 implements MigrationInterface {
	name = "AddCardFrameCosmeticType1782600000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE "cosmetic_type_enum" ADD VALUE IF NOT EXISTS 'CARD_FRAME'`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		// Postgres cannot remove a single enum value without recreating the whole
		// type and rewriting every column that uses it. Deleting the rows is the
		// reversible part; the value itself is left in place, inert.
		await queryRunner.query(`DELETE FROM "user_loadouts" WHERE "cosmetic_type" = 'CARD_FRAME'`);
		await queryRunner.query(`DELETE FROM "cosmetics" WHERE "type" = 'CARD_FRAME'`);
	}
}
