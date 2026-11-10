import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Swiss lightning tournaments: a second pairing system next to the arena. The tournament
 * row carries its system and the state of the current round (the round barrier and the
 * round deadline run from it); arena rows keep their behaviour through the defaults. Each
 * game is tagged with its round so a round can be closed and a rematch avoided. Byes have
 * their own table because they have no game row, yet must count once per player.
 */
export class AddLightningSwiss1782900000000 implements MigrationInterface {
	name = "AddLightningSwiss1782900000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "lightning_tournaments" ADD "system" character varying(16) NOT NULL DEFAULT 'arena', ADD "rounds" integer, ADD "current_round" integer NOT NULL DEFAULT 0, ADD "round_minutes" integer NOT NULL DEFAULT 40, ADD "round_break_seconds" integer NOT NULL DEFAULT 60, ADD "round_started_at" TIMESTAMP WITH TIME ZONE, ADD "round_closed_at" TIMESTAMP WITH TIME ZONE`,
		);
		await queryRunner.query(
			`ALTER TABLE "lightning_tournaments" ADD CONSTRAINT "CHK_lightning_tournaments_system" CHECK ("system" IN ('arena', 'swiss')), ADD CONSTRAINT "CHK_lightning_tournaments_rounds" CHECK ("rounds" IS NULL OR "rounds" >= 2), ADD CONSTRAINT "CHK_lightning_tournaments_current_round" CHECK ("current_round" >= 0), ADD CONSTRAINT "CHK_lightning_tournaments_round_minutes" CHECK ("round_minutes" >= 10 AND "round_minutes" <= 120), ADD CONSTRAINT "CHK_lightning_tournaments_round_break" CHECK ("round_break_seconds" >= 0 AND "round_break_seconds" <= 600)`,
		);
		await queryRunner.query(`ALTER TABLE "lightning_games" ADD "round" integer`);
		await queryRunner.query(
			`CREATE INDEX "IDX_lightning_games_round" ON "lightning_games" ("tournament_id", "round") WHERE "round" IS NOT NULL`,
		);
		await queryRunner.query(
			`CREATE TABLE "lightning_byes" ("tournament_id" uuid NOT NULL, "user_id" character varying NOT NULL, "round" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_lightning_byes" PRIMARY KEY ("tournament_id", "user_id", "round"), CONSTRAINT "FK_lightning_byes_tournament" FOREIGN KEY ("tournament_id") REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE, CONSTRAINT "FK_lightning_byes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "lightning_byes"`);
		await queryRunner.query(`DROP INDEX "IDX_lightning_games_round"`);
		await queryRunner.query(`ALTER TABLE "lightning_games" DROP COLUMN "round"`);
		await queryRunner.query(
			`ALTER TABLE "lightning_tournaments" DROP COLUMN "round_closed_at", DROP COLUMN "round_started_at", DROP COLUMN "round_break_seconds", DROP COLUMN "round_minutes", DROP COLUMN "current_round", DROP COLUMN "rounds", DROP COLUMN "system"`,
		);
	}
}
