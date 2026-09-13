import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the LANE cosmetic type: the frame a player's zones wear, equipped
 * beside the playmat rather than baked into it.
 *
 * No row is inserted here. `ALTER TYPE ... ADD VALUE` runs inside a
 * transaction on PG >= 12, but the freshly added value cannot be USED in that
 * same transaction, so seeding waits for the seed script.
 */
export class AddLaneCosmeticType1781600000000 implements MigrationInterface {
	name = "AddLaneCosmeticType1781600000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE "cosmetic_type_enum" ADD VALUE IF NOT EXISTS 'LANE'`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		// Postgres cannot remove a single enum value without recreating the whole
		// type and rewriting every column that uses it. Deleting the rows is the
		// reversible part; the value itself is left in place, inert.
		await queryRunner.query(`DELETE FROM "user_loadouts" WHERE "cosmetic_type" = 'LANE'`);
		await queryRunner.query(`DELETE FROM "cosmetics" WHERE "type" = 'LANE'`);
	}
}
