import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Catalog of missions the rewards worker evaluates. `rule` and `reward` are JSON so a new
 * mission or a new reward type is a row, not a migration. Seeds the launch set: a pool of
 * five daily missions (three rotate per day) and three fixed weekly missions, all paying
 * essence. The cosmetic reward shape is reserved for future event missions.
 */
export class CreateMissionCatalog1781900100000 implements MigrationInterface {
	name = "CreateMissionCatalog1781900100000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE TYPE "mission_period_enum" AS ENUM ('daily', 'weekly')`);
		await queryRunner.query(
			`CREATE TABLE "mission_catalog" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(64) NOT NULL, "name" character varying NOT NULL, "description" character varying NOT NULL, "period" "mission_period_enum" NOT NULL, "rule" jsonb NOT NULL, "reward" jsonb NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_mission_catalog" PRIMARY KEY ("id"), CONSTRAINT "UQ_mission_catalog_code" UNIQUE ("code"))`,
		);
		await queryRunner.query(
			`INSERT INTO "mission_catalog" ("code", "name", "description", "period", "rule", "reward", "sort_order") VALUES
			('play_3', 'Play 3 duels', 'Play 3 duels today', 'daily', '{"metric":"duelsPlayed","target":3}', '{"type":"essence","amount":20}', 10),
			('win_1', 'Win 1 duel', 'Win 1 duel today', 'daily', '{"metric":"duelsWon","target":1}', '{"type":"essence","amount":20}', 20),
			('ranked_play_1', 'Play 1 ranked duel', 'Play 1 ranked duel today', 'daily', '{"metric":"rankedDuelsPlayed","target":1}', '{"type":"essence","amount":20}', 30),
			('win_other_format', 'Switch it up', 'Win a duel in a format different from your previous duel', 'daily', '{"metric":"winDifferentFormat","target":1}', '{"type":"essence","amount":20}', 40),
			('win_fast', 'Quick draw', 'Win a duel in 10 turns or fewer', 'daily', '{"metric":"winUnder10Turns","target":1}', '{"type":"essence","amount":20}', 50),
			('weekly_win_10', 'Win 10 duels', 'Win 10 duels this week', 'weekly', '{"metric":"duelsWon","target":10}', '{"type":"essence","amount":100}', 100),
			('weekly_play_20', 'Play 20 duels', 'Play 20 duels this week', 'weekly', '{"metric":"duelsPlayed","target":20}', '{"type":"essence","amount":100}', 110),
			('weekly_ranked_streak_3', 'On a roll', 'Win 3 ranked duels in a row this week', 'weekly', '{"metric":"rankedWinStreak","target":3}', '{"type":"essence","amount":100}', 120)`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "mission_catalog"`);
		await queryRunner.query(`DROP TYPE "mission_period_enum"`);
	}
}
