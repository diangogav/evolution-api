import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One row per user holding the choices of their bust avatar as JSON. The web owns the catalog
 * of options, so the column is free-form jsonb and the API only checks its shape on save.
 * The foreign key to users(id) is raw SQL so this DataSource never maps the shared users table.
 */
export class CreatePlayerAvatars1783300000000 implements MigrationInterface {
	name = "CreatePlayerAvatars1783300000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "player_avatars" ("user_id" character varying NOT NULL, "config" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_player_avatars" PRIMARY KEY ("user_id"))`,
		);
		await queryRunner.query(
			`ALTER TABLE "player_avatars" ADD CONSTRAINT "FK_player_avatars_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "player_avatars" DROP CONSTRAINT "FK_player_avatars_user"`,
		);
		await queryRunner.query(`DROP TABLE "player_avatars"`);
	}
}
