import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Decks a player keeps in the cloud so they follow the account to every device.
 *
 * The id comes from the client, so a deck keeps its identity across devices. Times are the
 * client's: the copy changed last wins. A deletion leaves a tombstone (deleted_at, with the
 * contents cleared) so devices that still hold the deck learn about it. revision comes
 * from a sequence and is the sync cursor; a timestamp could repeat and skip a change.
 * Decks go with their user.
 */
export class CreateUserDecks1783700000000 implements MigrationInterface {
	name = "CreateUserDecks1783700000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE SEQUENCE "user_decks_revision_seq"`);
		await queryRunner.query(
			`CREATE TABLE "user_decks" ("user_id" character varying NOT NULL, "id" uuid NOT NULL, "name" character varying(64) NOT NULL, "format" character varying(32), "main" integer[] NOT NULL, "extra" integer[] NOT NULL, "side" integer[] NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "revision" bigint NOT NULL DEFAULT nextval('user_decks_revision_seq'), CONSTRAINT "PK_user_decks" PRIMARY KEY ("user_id", "id"), CONSTRAINT "FK_user_decks_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`ALTER SEQUENCE "user_decks_revision_seq" OWNED BY "user_decks"."revision"`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_user_decks_user_revision" ON "user_decks" ("user_id", "revision")`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		// The sequence is owned by the column, so it goes with the table.
		await queryRunner.query(`DROP TABLE "user_decks"`);
	}
}
