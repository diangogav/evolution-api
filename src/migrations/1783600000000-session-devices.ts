import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lets a player see the devices signed in to the account.
 *
 * user_agent is the User-Agent header of the request that signed in or renewed, so the
 * list can name the browser and OS. signed_in_at is the time of the sign-in a token
 * descends from, copied to every successor: expired tokens are deleted, so the oldest row
 * left in a family is not a reliable sign-in time. Existing families take the creation
 * time of their oldest remaining token.
 */
export class SessionDevices1783600000000 implements MigrationInterface {
	name = "SessionDevices1783600000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" ADD "user_agent" character varying(512), ADD "signed_in_at" TIMESTAMP WITH TIME ZONE`,
		);
		await queryRunner.query(
			`UPDATE "refresh_tokens" AS "token" SET "signed_in_at" = "family"."first" FROM (SELECT "family_id", MIN("created_at") AS "first" FROM "refresh_tokens" GROUP BY "family_id") AS "family" WHERE "token"."family_id" = "family"."family_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" ALTER COLUMN "signed_in_at" SET NOT NULL`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" DROP COLUMN "signed_in_at", DROP COLUMN "user_agent"`,
		);
	}
}
