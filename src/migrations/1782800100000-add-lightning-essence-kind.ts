import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Essence paid as lightning tournament prizes gets its own ledger kind. Its own migration
 * because a value added with ALTER TYPE cannot be used by the transaction that adds it; no
 * migration writes it, the lightning module does at runtime. Postgres cannot drop an enum
 * value, so `down` leaves it in place (unused values are harmless).
 */
export class AddLightningEssenceKind1782800100000 implements MigrationInterface {
	name = "AddLightningEssenceKind1782800100000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "essence_ledger_kind_enum" ADD VALUE IF NOT EXISTS 'lightning_tournament'`,
		);
	}

	async down(): Promise<void> {
		// Postgres has no ALTER TYPE ... DROP VALUE; the unused value stays.
	}
}
