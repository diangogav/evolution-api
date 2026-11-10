import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The achievements each lightning result unlocked, as the player saw them (code, name,
 * essence reward). The tournament ceremony reads them back from the result row; the
 * unlocks themselves live in the shared `user_achievements`, which cannot tell which
 * tournament wrote a row. Existing results unlocked nothing.
 */
export class AddLightningResultAchievements1783000000000 implements MigrationInterface {
	name = "AddLightningResultAchievements1783000000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "lightning_results" ADD "achievements" jsonb NOT NULL DEFAULT '[]'::jsonb`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "lightning_results" DROP COLUMN "achievements"`);
	}
}
