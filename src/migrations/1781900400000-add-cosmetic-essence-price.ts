import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Price in essence of a cosmetic in the shop; NULL means not for sale. DONOR
 * cosmetics get a price so non-donors can earn them by playing. STANDARD is free for
 * everyone and REGISTERED is already granted to every signed-in user by tier, so
 * neither is sold; EXCLUSIVE stays hand-granted unless a price is set later.
 */
export class AddCosmeticEssencePrice1781900400000 implements MigrationInterface {
	name = "AddCosmeticEssencePrice1781900400000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" ADD "essence_price" integer`);
		await queryRunner.query(
			`UPDATE "cosmetics" SET "essence_price" = 800, "updated_at" = now() WHERE "tier" = 'DONOR'`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "cosmetics" DROP COLUMN "essence_price"`);
	}
}
