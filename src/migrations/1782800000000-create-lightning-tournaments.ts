import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lightning tournaments (lightning module): short arenas that pair idle players
 * continuously for a fixed window, one reserved duel per pairing. The tournament row is
 * the lock every entry and game mutation takes. Entries hold the registered deck and the
 * running score; games record each reservation this module issued (the only ones it reads
 * back from the duel server's `reserved_duels`) and are the idempotency gate that applies
 * each record once. Results and season rankings are written once, when the tournament
 * completes. Foreign keys to users(id) are raw SQL so this DataSource never maps users.
 */
export class CreateLightningTournaments1782800000000 implements MigrationInterface {
	name = "CreateLightningTournaments1782800000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "lightning_tournament_status_enum" AS ENUM ('scheduled', 'registration', 'running', 'finishing', 'completed', 'cancelled')`,
		);
		await queryRunner.query(
			`CREATE TABLE "lightning_tournaments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(80) NOT NULL, "format" character varying(32) NOT NULL, "status" "lightning_tournament_status_enum" NOT NULL DEFAULT 'scheduled', "season" integer NOT NULL, "registration_opens_at" TIMESTAMP WITH TIME ZONE NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "turn_time_seconds" integer NOT NULL, "lobby_timeout_seconds" integer NOT NULL, "min_players" integer NOT NULL, "max_players" integer NOT NULL, "points_by_position" jsonb NOT NULL, "essence_by_position" jsonb NOT NULL, "created_by" character varying NOT NULL, "cancelled_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_lightning_tournaments" PRIMARY KEY ("id"), CONSTRAINT "CHK_lightning_tournaments_window" CHECK ("registration_opens_at" <= "starts_at" AND "starts_at" < "ends_at"), CONSTRAINT "CHK_lightning_tournaments_turn_time" CHECK ("turn_time_seconds" >= 60 AND "turn_time_seconds" <= 998), CONSTRAINT "CHK_lightning_tournaments_lobby_timeout" CHECK ("lobby_timeout_seconds" > 0), CONSTRAINT "CHK_lightning_tournaments_players" CHECK ("min_players" >= 2 AND "max_players" >= "min_players"))`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_lightning_tournaments_status_starts" ON "lightning_tournaments" ("status", "starts_at")`,
		);
		await queryRunner.query(
			`CREATE TABLE "lightning_entries" ("tournament_id" uuid NOT NULL, "user_id" character varying NOT NULL, "registered_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(16) NOT NULL, "presence" character varying(16) NOT NULL, "deck" jsonb NOT NULL, "score" integer NOT NULL DEFAULT 0, "wins" integer NOT NULL DEFAULT 0, "draws" integer NOT NULL DEFAULT 0, "losses" integer NOT NULL DEFAULT 0, "games_played" integer NOT NULL DEFAULT 0, "no_shows" integer NOT NULL DEFAULT 0, "last_opponent_id" character varying, "idle_since" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_lightning_entries" PRIMARY KEY ("tournament_id", "user_id"), CONSTRAINT "FK_lightning_entries_tournament" FOREIGN KEY ("tournament_id") REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE, CONSTRAINT "FK_lightning_entries_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "CHK_lightning_entries_status" CHECK ("status" IN ('active', 'withdrawn', 'removed')), CONSTRAINT "CHK_lightning_entries_presence" CHECK ("presence" IN ('idle', 'paired', 'playing', 'away')))`,
		);
		await queryRunner.query(
			`CREATE TABLE "lightning_games" ("reservation_id" character varying(16) NOT NULL, "tournament_id" uuid NOT NULL, "seat0_user_id" character varying NOT NULL, "seat1_user_id" character varying NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "resolution" character varying(16), "reason" character varying(64), "applied_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_lightning_games" PRIMARY KEY ("reservation_id"), CONSTRAINT "FK_lightning_games_tournament" FOREIGN KEY ("tournament_id") REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE, CONSTRAINT "CHK_lightning_games_status" CHECK ("status" IN ('pending', 'applied', 'voided')), CONSTRAINT "CHK_lightning_games_resolution" CHECK ("resolution" IS NULL OR "resolution" IN ('seat0_win', 'seat1_win', 'draw', 'void', 'no_show')))`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_lightning_games_pending" ON "lightning_games" ("tournament_id", "issued_at") WHERE "status" = 'pending'`,
		);
		await queryRunner.query(
			`CREATE TABLE "lightning_results" ("tournament_id" uuid NOT NULL, "user_id" character varying NOT NULL, "position" integer NOT NULL, "score" integer NOT NULL, "wins" integer NOT NULL, "draws" integer NOT NULL, "losses" integer NOT NULL, "tiebreak" integer NOT NULL, "points_awarded" integer NOT NULL, "essence_awarded" integer NOT NULL, CONSTRAINT "PK_lightning_results" PRIMARY KEY ("tournament_id", "user_id"), CONSTRAINT "FK_lightning_results_tournament" FOREIGN KEY ("tournament_id") REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE TABLE "lightning_rankings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" character varying NOT NULL, "season" integer NOT NULL, "points" integer NOT NULL DEFAULT 0, "tournaments_won" integer NOT NULL DEFAULT 0, "tournaments_played" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_lightning_rankings" PRIMARY KEY ("id"), CONSTRAINT "UQ_lightning_rankings_user_season" UNIQUE ("user_id", "season"), CONSTRAINT "FK_lightning_rankings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_lightning_rankings_season_points" ON "lightning_rankings" ("season", "points" DESC)`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "lightning_rankings"`);
		await queryRunner.query(`DROP TABLE "lightning_results"`);
		await queryRunner.query(`DROP TABLE "lightning_games"`);
		await queryRunner.query(`DROP TABLE "lightning_entries"`);
		await queryRunner.query(`DROP TABLE "lightning_tournaments"`);
		await queryRunner.query(`DROP TYPE "lightning_tournament_status_enum"`);
	}
}
