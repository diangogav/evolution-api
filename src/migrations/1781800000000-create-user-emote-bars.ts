import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One row per user holding the 8 emote refs of their bar, in slot order. The bar is always
 * read and replaced as a whole, so a single array column makes every save one atomic upsert.
 * The foreign key to users(id) is raw SQL so this DataSource never maps the shared users table.
 */
export class CreateUserEmoteBars1781800000000 implements MigrationInterface {
	name = "CreateUserEmoteBars1781800000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "user_emote_bars" ("user_id" character varying NOT NULL, "emote_refs" character varying(48) array NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_user_emote_bars" PRIMARY KEY ("user_id"), CONSTRAINT "CHK_user_emote_bars_slots" CHECK (cardinality("emote_refs") = 8))`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_emote_bars" ADD CONSTRAINT "FK_user_emote_bars_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "user_emote_bars" DROP CONSTRAINT "FK_user_emote_bars_user"`,
		);
		await queryRunner.query(`DROP TABLE "user_emote_bars"`);
	}
}
