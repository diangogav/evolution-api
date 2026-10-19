import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the AMBIENCE cosmetic type: the drifting motes and light sweep a
 * player's board wears over the stage.
 *
 * No row is inserted here. `ALTER TYPE ... ADD VALUE` runs inside a
 * transaction on PG >= 12, but the freshly added value cannot be USED in that
 * same transaction, so seeding waits for the seed script.
 */
export class AddAmbienceCosmeticType1781800000000 implements MigrationInterface {
	name = "AddAmbienceCosmeticType1781800000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE "cosmetic_type_enum" ADD VALUE IF NOT EXISTS 'AMBIENCE'`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		// Postgres cannot remove a single enum value without recreating the whole
		// type and rewriting every column that uses it. Deleting the rows is the
		// reversible part; the value itself is left in place, inert.
		await queryRunner.query(`DELETE FROM "user_loadouts" WHERE "cosmetic_type" = 'AMBIENCE'`);
		await queryRunner.query(`DELETE FROM "cosmetics" WHERE "type" = 'AMBIENCE'`);
	}
}
