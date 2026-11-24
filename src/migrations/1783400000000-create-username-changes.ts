import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One row per username change. The latest row enforces the 30-day cooldown between
 * renames, and the history lets moderators see which names an account used, since
 * matches only keep the name a player had when they played. Users are keyed like the
 * other tables that reference them (users.id is a varchar), and the history goes with
 * the user.
 */
export class CreateUsernameChanges1783400000000 implements MigrationInterface {
	name = "CreateUsernameChanges1783400000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "username_changes" ("id" uuid NOT NULL, "user_id" character varying NOT NULL, "previous_username" character varying NOT NULL, "new_username" character varying NOT NULL, "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_username_changes" PRIMARY KEY ("id"), CONSTRAINT "FK_username_changes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_username_changes_user_id_changed_at" ON "username_changes" ("user_id", "changed_at")`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "username_changes"`);
	}
}
