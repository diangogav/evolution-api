import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Event gauntlets (event-run module). `event_catalog` holds one row per event: its window,
 * daily attempts, the WindBot names of its waves in order, the decks a player may pick and
 * the cumulative prize tiers, as JSON so a new event is a row. A run is one attempt; the
 * partial unique index allows a single `ready` run per (user, event). Attempts are counted
 * per UTC day at run start. `event_run_reservations` lists the duel reservations this
 * module issued (the only ones it ever reads back from the duel server's
 * `reserved_duels`), and `event_run_duels` is the idempotency gate that applies each duel
 * record once. Foreign keys to users(id) are raw SQL so this DataSource never maps users.
 */
export class CreateEventRuns1782000000000 implements MigrationInterface {
	name = "CreateEventRuns1782000000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "event_catalog" ("id" character varying(64) NOT NULL, "name" jsonb NOT NULL, "description" jsonb NOT NULL, "format" character varying(32) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts_per_day" integer NOT NULL, "waves" jsonb NOT NULL, "decks" jsonb NOT NULL, "prize_tiers" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_event_catalog" PRIMARY KEY ("id"), CONSTRAINT "CHK_event_catalog_attempts" CHECK ("attempts_per_day" > 0), CONSTRAINT "CHK_event_catalog_window" CHECK ("ends_at" > "starts_at"))`,
		);
		await queryRunner.query(
			`CREATE TYPE "event_run_status_enum" AS ENUM ('ready', 'won', 'lost', 'expired', 'superseded')`,
		);
		await queryRunner.query(
			`CREATE TABLE "event_runs" ("id" uuid NOT NULL, "user_id" character varying NOT NULL, "event_id" character varying(64) NOT NULL, "deck_id" character varying(64) NOT NULL, "status" "event_run_status_enum" NOT NULL, "current_wave" integer NOT NULL, "waves_cleared" integer NOT NULL DEFAULT 0, "current_reservation_id" character varying(16), "voids" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_event_runs" PRIMARY KEY ("id"), CONSTRAINT "FK_event_runs_event" FOREIGN KEY ("event_id") REFERENCES "event_catalog"("id") ON DELETE CASCADE, CONSTRAINT "FK_event_runs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_event_runs_one_ready" ON "event_runs" ("user_id", "event_id") WHERE "status" = 'ready'`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_event_runs_user_event" ON "event_runs" ("user_id", "event_id", "created_at")`,
		);
		await queryRunner.query(
			`CREATE TABLE "event_run_attempts" ("user_id" character varying NOT NULL, "event_id" character varying(64) NOT NULL, "period_key" character varying(16) NOT NULL, "count" integer NOT NULL, CONSTRAINT "PK_event_run_attempts" PRIMARY KEY ("user_id", "event_id", "period_key"), CONSTRAINT "FK_event_run_attempts_event" FOREIGN KEY ("event_id") REFERENCES "event_catalog"("id") ON DELETE CASCADE, CONSTRAINT "FK_event_run_attempts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE TABLE "event_run_reservations" ("reservation_id" character varying(16) NOT NULL, "run_id" uuid NOT NULL, "wave" integer NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_event_run_reservations" PRIMARY KEY ("reservation_id"), CONSTRAINT "FK_event_run_reservations_run" FOREIGN KEY ("run_id") REFERENCES "event_runs"("id") ON DELETE CASCADE)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_event_run_reservations_run" ON "event_run_reservations" ("run_id")`,
		);
		await queryRunner.query(
			`CREATE TABLE "event_run_duels" ("reservation_id" character varying(16) NOT NULL, "run_id" uuid NOT NULL, "outcome" character varying(32) NOT NULL, "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_event_run_duels" PRIMARY KEY ("reservation_id"), CONSTRAINT "FK_event_run_duels_reservation" FOREIGN KEY ("reservation_id") REFERENCES "event_run_reservations"("reservation_id") ON DELETE CASCADE)`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "event_run_duels"`);
		await queryRunner.query(`DROP TABLE "event_run_reservations"`);
		await queryRunner.query(`DROP TABLE "event_run_attempts"`);
		await queryRunner.query(`DROP TABLE "event_runs"`);
		await queryRunner.query(`DROP TYPE "event_run_status_enum"`);
		await queryRunner.query(`DROP TABLE "event_catalog"`);
	}
}
