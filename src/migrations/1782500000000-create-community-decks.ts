import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Legal decks synced from community sites (YGOPRODeck). One row per source deck; `category`
 * is the source category a sync replaces as a whole, `format` the ban list label the deck
 * passed. `content_hash` identifies the sorted lists so duplicate uploads are stored once.
 */
export class CreateCommunityDecks1782500000000 implements MigrationInterface {
	name = "CreateCommunityDecks1782500000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "community_decks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "source" character varying(32) NOT NULL, "source_id" character varying(64) NOT NULL, "category" character varying(128) NOT NULL, "url" text NOT NULL, "author" text NOT NULL, "name" text NOT NULL, "format" character varying(64) NOT NULL, "cover_card" integer NOT NULL, "main" integer[] NOT NULL, "extra" integer[] NOT NULL DEFAULT '{}', "side" integer[] NOT NULL DEFAULT '{}', "views" integer NOT NULL DEFAULT 0, "content_hash" character(64) NOT NULL, "source_updated_at" TIMESTAMP WITH TIME ZONE, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_community_decks" PRIMARY KEY ("id"), CONSTRAINT "UQ_community_decks_source" UNIQUE ("source", "source_id"))`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_decks_format_views" ON "community_decks" ("format", "views" DESC)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_decks_source_category" ON "community_decks" ("source", "category")`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_community_decks_source_category"`);
		await queryRunner.query(`DROP INDEX "IDX_community_decks_format_views"`);
		await queryRunner.query(`DROP TABLE "community_decks"`);
	}
}
