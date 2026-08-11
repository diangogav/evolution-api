import type { MigrationInterface, QueryRunner } from "typeorm";

/** Dynamic backoffice publication requires one catalog row per stable R2 prefix. */
export class UniqueCosmeticAssetRef1781400000000 implements MigrationInterface {
	name = "UniqueCosmeticAssetRef1781400000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "cosmetics" ADD CONSTRAINT "UQ_cosmetics_asset_ref" UNIQUE ("asset_ref")`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" DROP CONSTRAINT "UQ_cosmetics_asset_ref"`);
	}
}
