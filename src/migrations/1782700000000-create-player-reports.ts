import type { MigrationInterface, QueryRunner } from "typeorm";

// API-owned moderation evidence. Actor IDs are immutable snapshots, deliberately
// not cascading foreign keys: account removal must not erase a review trail.
export class CreatePlayerReports1782700000000 implements MigrationInterface {
	name = "CreatePlayerReports1782700000000";
	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE TABLE player_reports (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id varchar(128) NOT NULL,
   reported_user_id varchar(128) NOT NULL, game_id uuid NOT NULL,
   reason varchar(32) NOT NULL CHECK(reason IN ('harassment','cheating','stalling','inappropriate_name','other')),
   details text NOT NULL CHECK(char_length(details) BETWEEN 10 AND 2000), context jsonb NOT NULL,
   status varchar(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved','dismissed')),
   revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),
   updated_at timestamptz NOT NULL DEFAULT now(), CHECK(reporter_id<>reported_user_id),
   CONSTRAINT uq_player_report_match UNIQUE(reporter_id,game_id,reported_user_id))`);
		await queryRunner.query(
			"CREATE INDEX idx_player_reports_reporter_created ON player_reports(reporter_id,created_at DESC)",
		);
		await queryRunner.query(
			"CREATE INDEX idx_player_reports_queue ON player_reports(status,created_at DESC,id DESC)",
		);
		await queryRunner.query(`CREATE TABLE player_report_reviews (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES player_reports(id),
   admin_user_id varchar(128) NOT NULL, from_status varchar(16) NOT NULL, to_status varchar(16) NOT NULL,
   note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 2000), revision integer NOT NULL CHECK(revision>1),
   created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(report_id,revision))`);
	}
	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query("DROP TABLE player_report_reviews");
		await queryRunner.query("DROP TABLE player_reports");
	}
}
