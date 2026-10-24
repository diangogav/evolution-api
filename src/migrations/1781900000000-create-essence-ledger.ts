import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Append-only ledger of essence movements. The balance is never stored; it is the sum of
 * a user's deltas, so every credit and debit stays auditable and reversible by a
 * compensating row. (user_id, kind, reference_key) is unique: retrying a credit or a
 * purchase cannot double-apply it. The foreign key to users(id) is raw SQL so this
 * DataSource never maps the shared users table.
 */
export class CreateEssenceLedger1781900000000 implements MigrationInterface {
	name = "CreateEssenceLedger1781900000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "essence_ledger_kind_enum" AS ENUM ('mission', 'daily_bonus', 'achievement', 'purchase', 'adjustment')`,
		);
		await queryRunner.query(
			`CREATE TABLE "essence_ledger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "kind" "essence_ledger_kind_enum" NOT NULL, "reference_key" character varying NOT NULL, "delta" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_essence_ledger" PRIMARY KEY ("id"), CONSTRAINT "CHK_essence_ledger_delta_nonzero" CHECK ("delta" <> 0))`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_essence_ledger_movement" ON "essence_ledger" ("user_id", "kind", "reference_key")`,
		);
		await queryRunner.query(
			`ALTER TABLE "essence_ledger" ADD CONSTRAINT "FK_essence_ledger_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "essence_ledger" DROP CONSTRAINT "FK_essence_ledger_user"`,
		);
		await queryRunner.query(`DROP INDEX "UQ_essence_ledger_movement"`);
		await queryRunner.query(`DROP TABLE "essence_ledger"`);
		await queryRunner.query(`DROP TYPE "essence_ledger_kind_enum"`);
	}
}
