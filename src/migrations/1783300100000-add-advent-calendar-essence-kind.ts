import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Essence moved by the advent calendar (door prizes, die bonuses and recovery charges) gets
 * its own ledger kind. Its own migration because a value added with ALTER TYPE cannot be
 * used by the transaction that adds it; no migration writes it, the advent-calendar module
 * does at runtime. Postgres cannot drop an enum value, so `down` leaves it in place (unused
 * values are harmless).
 */
export class AddAdventCalendarEssenceKind1783300100000 implements MigrationInterface {
	name = "AddAdventCalendarEssenceKind1783300100000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "essence_ledger_kind_enum" ADD VALUE IF NOT EXISTS 'advent_calendar'`,
		);
	}

	async down(): Promise<void> {
		// Postgres has no ALTER TYPE ... DROP VALUE; the unused value stays.
	}
}
