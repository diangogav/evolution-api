import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Cosmetics equipped by WindBot bots, one row per slot. bot_name is the exact botlist
 * name; bots are not users, so there is no foreign key to users(id). Deleting a cosmetic
 * drops it from any bot that wore it instead of blocking the catalog change.
 */
export class CreateBotLoadouts1782000000000 implements MigrationInterface {
	name = "CreateBotLoadouts1782000000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "bot_loadouts" ("bot_name" character varying(64) NOT NULL, "cosmetic_type" "cosmetic_type_enum" NOT NULL, "cosmetic_id" uuid NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bot_loadouts" PRIMARY KEY ("bot_name", "cosmetic_type"))`,
		);
		await queryRunner.query(
			`ALTER TABLE "bot_loadouts" ADD CONSTRAINT "FK_bot_loadouts_cosmetic" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "bot_loadouts" DROP CONSTRAINT "FK_bot_loadouts_cosmetic"`,
		);
		await queryRunner.query(`DROP TABLE "bot_loadouts"`);
	}
}
