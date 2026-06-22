import { MigrationInterface, QueryRunner } from "typeorm";

// Adds the EXCLUSIVE cosmetic tier. It ranks above every user tier the gatekeeper can
// assign (STANDARD/REGISTERED/DONOR), so no tier ever grants an EXCLUSIVE cosmetic —
// access comes solely from a per-user COSMETIC entitlement. No rows are inserted here:
// `ALTER TYPE ... ADD VALUE` runs in a transaction on PG >= 12, but the freshly added
// enum value cannot be USED in the same transaction, so seeding EXCLUSIVE cosmetics is
// deferred to the seed (matched by asset_ref, idempotent).
export class AddExclusiveCosmeticTier1781200000000 implements MigrationInterface {
	name = "AddExclusiveCosmeticTier1781200000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE "cosmetic_tier_enum" ADD VALUE IF NOT EXISTS 'EXCLUSIVE'`);
	}

	public async down(): Promise<void> {
		// Postgres cannot remove a single enum value without recreating the whole type
		// (and rewriting every column that uses it), which is fragile and risky. The
		// 'EXCLUSIVE' value is therefore intentionally left in place on down.
	}
}
