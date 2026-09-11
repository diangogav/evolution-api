import type { MigrationInterface, QueryRunner } from "typeorm";

// The 3D renderer was retired: COMPANION cosmetics have no client any more, so the
// jsonb column that only they populated goes away. The 'COMPANION' value stays in
// cosmetic_type_enum because Postgres cannot drop an enum value without recreating
// the type; no row uses it once companions are removed from the seed.
export class DropCosmeticAnimation1781500000000 implements MigrationInterface {
	name = "DropCosmeticAnimation1781500000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		// user_loadouts.cosmetic_id is ON DELETE RESTRICT, so equipped companions must
		// be unequipped before their catalog rows can go.
		await queryRunner.query(`DELETE FROM "user_loadouts" WHERE "cosmetic_type" = 'COMPANION'`);
		// Per-user grants (entitlements.grant_value holds the cosmetic id, no FK) would
		// otherwise dangle.
		await queryRunner.query(
			`DELETE FROM "entitlements" WHERE "grant_type" = 'COSMETIC' AND "grant_value" IN (SELECT "id"::text FROM "cosmetics" WHERE "type" = 'COMPANION')`,
		);
		await queryRunner.query(`DELETE FROM "cosmetics" WHERE "type" = 'COMPANION'`);
		await queryRunner.query(`ALTER TABLE "cosmetics" DROP COLUMN "animation"`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" ADD COLUMN "animation" jsonb`);
	}
}
