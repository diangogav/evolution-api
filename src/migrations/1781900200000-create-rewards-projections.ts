import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Projections the rewards worker maintains from the game server's match tables.
 * rewards_cursor remembers how far each source was drained; mission_progress holds one
 * row per user, mission and period (completed_at is set once and never cleared);
 * user_reward_state keeps what spans periods (last format played, live ranked streak).
 * Foreign keys to users(id) are raw SQL so this DataSource never maps the shared table.
 */
export class CreateRewardsProjections1781900200000 implements MigrationInterface {
	name = "CreateRewardsProjections1781900200000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "rewards_cursor" ("source" character varying(32) NOT NULL, "last_created_at" TIMESTAMP WITH TIME ZONE, "last_id" character varying, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_rewards_cursor" PRIMARY KEY ("source"))`,
		);
		await queryRunner.query(
			`CREATE TABLE "mission_progress" ("user_id" character varying NOT NULL, "mission_id" uuid NOT NULL, "period_key" character varying(16) NOT NULL, "value" integer NOT NULL DEFAULT 0, "completed_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_mission_progress" PRIMARY KEY ("user_id", "mission_id", "period_key"))`,
		);
		await queryRunner.query(
			`ALTER TABLE "mission_progress" ADD CONSTRAINT "FK_mission_progress_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "mission_progress" ADD CONSTRAINT "FK_mission_progress_mission" FOREIGN KEY ("mission_id") REFERENCES "mission_catalog"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`CREATE TABLE "user_reward_state" ("user_id" character varying NOT NULL, "last_format" character varying, "ranked_streak" integer NOT NULL DEFAULT 0, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_user_reward_state" PRIMARY KEY ("user_id"))`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_reward_state" ADD CONSTRAINT "FK_user_reward_state_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "user_reward_state"`);
		await queryRunner.query(`DROP TABLE "mission_progress"`);
		await queryRunner.query(`DROP TABLE "rewards_cursor"`);
	}
}
