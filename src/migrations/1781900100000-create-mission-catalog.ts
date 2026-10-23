import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Catalog of missions the rewards worker evaluates. `rule` and `reward` are JSON so a new
 * mission or a new reward type is a row, not a migration. `name` and `description` hold
 * player-facing copy per language (`en` mandatory, `es` optional) so both clients read
 * the same source. Seeds the launch set: a pool of
 * five daily missions (three rotate per day) and three fixed weekly missions, all paying
 * essence. The cosmetic reward shape is reserved for future event missions.
 */
export class CreateMissionCatalog1781900100000 implements MigrationInterface {
	name = "CreateMissionCatalog1781900100000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE TYPE "mission_period_enum" AS ENUM ('daily', 'weekly')`);
		await queryRunner.query(
			`CREATE TABLE "mission_catalog" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(64) NOT NULL, "name" jsonb NOT NULL, "description" jsonb NOT NULL, "period" "mission_period_enum" NOT NULL, "rule" jsonb NOT NULL, "reward" jsonb NOT NULL, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_mission_catalog" PRIMARY KEY ("id"), CONSTRAINT "UQ_mission_catalog_code" UNIQUE ("code"))`,
		);
		await queryRunner.query(
			`INSERT INTO "mission_catalog" ("code", "name", "description", "period", "rule", "reward", "sort_order") VALUES
			('play_3', '{"en": "Play 3 duels", "es": "Juega 3 duelos"}', '{"en": "Play 3 duels today", "es": "Juega 3 duelos hoy"}', 'daily', '{"metric":"duelsPlayed","target":3}', '{"type":"essence","amount":20}', 10),
			('win_1', '{"en": "Win 1 duel", "es": "Gana 1 duelo"}', '{"en": "Win 1 duel today", "es": "Gana 1 duelo hoy"}', 'daily', '{"metric":"duelsWon","target":1}', '{"type":"essence","amount":20}', 20),
			('ranked_play_1', '{"en": "Play 1 ranked duel", "es": "Juega 1 duelo ranked"}', '{"en": "Play 1 ranked duel today", "es": "Juega 1 duelo ranked hoy"}', 'daily', '{"metric":"rankedDuelsPlayed","target":1}', '{"type":"essence","amount":20}', 30),
			('win_other_format', '{"en": "Switch it up", "es": "Cambio de aires"}', '{"en": "Win a duel in a format different from your previous duel", "es": "Gana un duelo en un formato distinto al de tu duelo anterior"}', 'daily', '{"metric":"winDifferentFormat","target":1}', '{"type":"essence","amount":20}', 40),
			('win_fast', '{"en": "Quick draw", "es": "Mano rápida"}', '{"en": "Win a duel in 10 turns or fewer", "es": "Gana un duelo en 10 turnos o menos"}', 'daily', '{"metric":"winUnder10Turns","target":1}', '{"type":"essence","amount":20}', 50),
			('weekly_win_10', '{"en": "Win 10 duels", "es": "Gana 10 duelos"}', '{"en": "Win 10 duels this week", "es": "Gana 10 duelos esta semana"}', 'weekly', '{"metric":"duelsWon","target":10}', '{"type":"essence","amount":100}', 100),
			('weekly_play_20', '{"en": "Play 20 duels", "es": "Juega 20 duelos"}', '{"en": "Play 20 duels this week", "es": "Juega 20 duelos esta semana"}', 'weekly', '{"metric":"duelsPlayed","target":20}', '{"type":"essence","amount":100}', 110),
			('weekly_ranked_streak_3', '{"en": "On a roll", "es": "En racha"}', '{"en": "Win 3 ranked duels in a row this week", "es": "Gana 3 duelos ranked seguidos esta semana"}', 'weekly', '{"metric":"rankedWinStreak","target":3}', '{"type":"essence","amount":100}', 120)`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "mission_catalog"`);
		await queryRunner.query(`DROP TYPE "mission_period_enum"`);
	}
}
