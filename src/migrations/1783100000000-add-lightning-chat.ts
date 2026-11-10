import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One chat channel per lightning tournament. The bigserial id is strictly increasing, so it
 * doubles as the stream cursor: "every message after id N" is a range scan on
 * (tournament_id, id). Admins hide a message by stamping deleted_at/deleted_by instead of
 * deleting the row, so a history read can still tell readers which message to drop. Users
 * are keyed the same way as the other lightning tables (users.id is a varchar), and a
 * user's messages go with the user.
 */
export class AddLightningChat1783100000000 implements MigrationInterface {
	name = "AddLightningChat1783100000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "lightning_chat_messages" ("id" BIGSERIAL NOT NULL, "tournament_id" uuid NOT NULL, "user_id" character varying NOT NULL, "body" character varying(200) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" character varying, CONSTRAINT "PK_lightning_chat_messages" PRIMARY KEY ("id"), CONSTRAINT "FK_lightning_chat_messages_tournament" FOREIGN KEY ("tournament_id") REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE, CONSTRAINT "FK_lightning_chat_messages_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "CHK_lightning_chat_messages_body" CHECK (char_length("body") BETWEEN 1 AND 200))`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_lightning_chat_messages_tournament_id" ON "lightning_chat_messages" ("tournament_id", "id")`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "lightning_chat_messages"`);
	}
}
