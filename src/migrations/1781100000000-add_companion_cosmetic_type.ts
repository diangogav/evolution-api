import { MigrationInterface, QueryRunner } from "typeorm";

// Adds the COMPANION cosmetic type and the nullable `animation` jsonb column that only
// COMPANION cosmetics populate. No COMPANION rows are inserted here: `ALTER TYPE ... ADD
// VALUE` runs inside a transaction on PG >= 12, but the freshly added enum value cannot
// be USED in the same transaction, so seeding companion data is deferred to the seed once
// the R2 assets exist.
export class AddCompanionCosmeticType1781100000000 implements MigrationInterface {
	name = "AddCompanionCosmeticType1781100000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE "cosmetic_type_enum" ADD VALUE IF NOT EXISTS 'COMPANION'`);
		await queryRunner.query(`ALTER TABLE "cosmetics" ADD COLUMN "animation" jsonb`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" DROP COLUMN "animation"`);
		// Postgres cannot remove a single enum value without recreating the whole type
		// (and rewriting every column that uses it), which is fragile and risky. The
		// 'COMPANION' value is therefore intentionally left in place on down.
	}
}
