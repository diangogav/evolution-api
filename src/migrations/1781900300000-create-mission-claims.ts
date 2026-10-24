import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One row per claimed mission, user and period. The primary key is the idempotency
 * guard for POST /me/missions/:code/claim: a duplicate claim hits it and is skipped.
 * The FK to users(id) is raw SQL so this DataSource never maps the shared table.
 */
export class CreateMissionClaims1781900300000 implements MigrationInterface {
	name = "CreateMissionClaims1781900300000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "mission_claims" ("user_id" character varying NOT NULL, "mission_id" uuid NOT NULL, "period_key" character varying(16) NOT NULL, "claimed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_mission_claims" PRIMARY KEY ("user_id", "mission_id", "period_key"))`,
		);
		await queryRunner.query(
			`ALTER TABLE "mission_claims" ADD CONSTRAINT "FK_mission_claims_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "mission_claims" ADD CONSTRAINT "FK_mission_claims_mission" FOREIGN KEY ("mission_id") REFERENCES "mission_catalog"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "mission_claims"`);
	}
}
