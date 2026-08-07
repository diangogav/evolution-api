import type { MigrationInterface, QueryRunner } from "typeorm";

/** Stores relative object keys so request-time signing does not need R2 ListObjects. */
export class AddCosmeticAssetFiles1781300000000 implements MigrationInterface {
	name = "AddCosmeticAssetFiles1781300000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" ADD COLUMN "asset_files" text array`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" DROP COLUMN "asset_files"`);
	}
}
