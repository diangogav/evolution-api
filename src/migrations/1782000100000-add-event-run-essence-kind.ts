import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Essence paid by event prize tiers gets its own ledger kind. Its own migration because a
 * value added with ALTER TYPE cannot be used by the transaction that adds it; no migration
 * writes it, the event-run module does at runtime. Postgres cannot drop an enum value, so
 * `down` leaves it in place (unused values are harmless).
 */
export class AddEventRunEssenceKind1782000100000 implements MigrationInterface {
	name = "AddEventRunEssenceKind1782000100000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "essence_ledger_kind_enum" ADD VALUE IF NOT EXISTS 'event_run'`,
		);
	}

	async down(): Promise<void> {
		// Postgres has no ALTER TYPE ... DROP VALUE; the unused value stays.
	}
}
