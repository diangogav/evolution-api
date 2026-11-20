import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Advent calendars (advent-calendar module). `advent_calendar_catalog` holds one row per
 * calendar: its window, the price of recovering a missed door, and its doors, decks and
 * bonus die as JSON so a new calendar is a row. `advent_doors` is one row per player and
 * door, created the first time the player touches the door; its primary key is what makes
 * a door cleared, rolled and recovered once. `advent_reservations` lists the duel
 * reservations this module issued (the only ones it ever reads back from the duel server's
 * `reserved_duels`), and `advent_duels` is the idempotency gate that applies each duel
 * record once. Foreign keys to users(id) are raw SQL so this DataSource never maps users.
 * Only new tables are created; nothing existing is altered.
 */
export class CreateAdventCalendar1783300000000 implements MigrationInterface {
	name = "CreateAdventCalendar1783300000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "advent_calendar_catalog" ("id" character varying(64) NOT NULL, "name" jsonb NOT NULL, "description" jsonb NOT NULL, "format" character varying(32) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "recovery_price" integer NOT NULL, "doors" jsonb NOT NULL, "decks" jsonb NOT NULL, "die" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_advent_calendar_catalog" PRIMARY KEY ("id"), CONSTRAINT "CHK_advent_calendar_catalog_price" CHECK ("recovery_price" > 0), CONSTRAINT "CHK_advent_calendar_catalog_window" CHECK ("ends_at" > "starts_at"))`,
		);
		await queryRunner.query(
			`CREATE TABLE "advent_doors" ("user_id" character varying NOT NULL, "calendar_id" character varying(64) NOT NULL, "day" integer NOT NULL, "recovered_at" TIMESTAMP WITH TIME ZONE, "cleared_at" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT 0, "die_roll" integer, "current_reservation_id" character varying(16), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_advent_doors" PRIMARY KEY ("user_id", "calendar_id", "day"), CONSTRAINT "CHK_advent_doors_day" CHECK ("day" > 0), CONSTRAINT "CHK_advent_doors_attempts" CHECK ("attempts" >= 0), CONSTRAINT "CHK_advent_doors_die_roll" CHECK ("die_roll" BETWEEN 1 AND 6), CONSTRAINT "FK_advent_doors_calendar" FOREIGN KEY ("calendar_id") REFERENCES "advent_calendar_catalog"("id") ON DELETE CASCADE, CONSTRAINT "FK_advent_doors_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE TABLE "advent_reservations" ("reservation_id" character varying(16) NOT NULL, "user_id" character varying NOT NULL, "calendar_id" character varying(64) NOT NULL, "day" integer NOT NULL, "deck_id" character varying(64) NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_advent_reservations" PRIMARY KEY ("reservation_id"), CONSTRAINT "FK_advent_reservations_door" FOREIGN KEY ("user_id", "calendar_id", "day") REFERENCES "advent_doors"("user_id", "calendar_id", "day") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_advent_reservations_door" ON "advent_reservations" ("user_id", "calendar_id", "day")`,
		);
		await queryRunner.query(
			`CREATE TABLE "advent_duels" ("reservation_id" character varying(16) NOT NULL, "outcome" character varying(32) NOT NULL, "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_advent_duels" PRIMARY KEY ("reservation_id"), CONSTRAINT "FK_advent_duels_reservation" FOREIGN KEY ("reservation_id") REFERENCES "advent_reservations"("reservation_id") ON DELETE CASCADE)`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "advent_duels"`);
		await queryRunner.query(`DROP TABLE "advent_reservations"`);
		await queryRunner.query(`DROP TABLE "advent_doors"`);
		await queryRunner.query(`DROP TABLE "advent_calendar_catalog"`);
	}
}
