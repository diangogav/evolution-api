import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Refresh tokens let a client renew its session without asking for the password again.
 *
 * Only the SHA-256 of a token is stored, so a leaked table cannot be replayed. Each token
 * works once: renewing stamps used_at and issues a successor in the same family (one
 * family per sign-in). A token presented again after it was used means two parties hold
 * it, so the whole family is revoked. must_upgrade carries the sign-in's "must set an
 * account password" flag across renewals. Users are keyed like the other tables that
 * reference them (users.id is a varchar), and a user's tokens go with the user.
 */
export class CreateRefreshTokens1783200000000 implements MigrationInterface {
	name = "CreateRefreshTokens1783200000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL, "user_id" character varying NOT NULL, "family_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "must_upgrade" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"), CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"), CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "refresh_tokens"`);
	}
}
