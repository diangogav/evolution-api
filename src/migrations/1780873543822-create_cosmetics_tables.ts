import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCosmeticsTables1780873543822 implements MigrationInterface {
	name = "CreateCosmeticsTables1780873543822";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

		await queryRunner.query(
			`CREATE TYPE "cosmetic_type_enum" AS ENUM('SLEEVE', 'PLAYMAT', 'CARD_BACK', 'AVATAR', 'SUMMON_EFFECT', 'MUSIC', 'TITLE')`
		);
		await queryRunner.query(
			`CREATE TYPE "cosmetic_tier_enum" AS ENUM('STANDARD', 'REGISTERED', 'DONOR')`
		);
		await queryRunner.query(`CREATE TYPE "grant_type_enum" AS ENUM('TIER', 'COSMETIC')`);
		await queryRunner.query(
			`CREATE TYPE "entitlement_source_enum" AS ENUM('REGISTRATION', 'DONATION', 'PURCHASE', 'CAMPAIGN')`
		);

		await queryRunner.query(
			`CREATE TABLE "cosmetics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "cosmetic_type_enum" NOT NULL, "tier" "cosmetic_tier_enum" NOT NULL, "asset_ref" character varying NOT NULL, "display_name" character varying NOT NULL, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cosmetics_id" PRIMARY KEY ("id"))`
		);

		await queryRunner.query(
			`CREATE TABLE "user_loadouts" ("user_id" character varying NOT NULL, "cosmetic_type" "cosmetic_type_enum" NOT NULL, "cosmetic_id" uuid NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_user_loadouts" PRIMARY KEY ("user_id", "cosmetic_type"))`
		);

		await queryRunner.query(
			`CREATE TABLE "entitlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "grant_type" "grant_type_enum" NOT NULL, "grant_value" character varying NOT NULL, "source" "entitlement_source_enum" NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_entitlements_id" PRIMARY KEY ("id"))`
		);

		await queryRunner.query(
			`CREATE INDEX "IDX_entitlements_user_id" ON "entitlements" ("user_id")`
		);

		// Foreign keys to the shared users table (users.id is varchar). Declared in raw
		// SQL so the cosmetics DataSource never needs to map the shared UserProfileEntity.
		await queryRunner.query(
			`ALTER TABLE "user_loadouts" ADD CONSTRAINT "FK_user_loadouts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "user_loadouts" ADD CONSTRAINT "FK_user_loadouts_cosmetic" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
		);
		await queryRunner.query(
			`ALTER TABLE "entitlements" ADD CONSTRAINT "FK_entitlements_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "entitlements" DROP CONSTRAINT "FK_entitlements_user"`);
		await queryRunner.query(
			`ALTER TABLE "user_loadouts" DROP CONSTRAINT "FK_user_loadouts_cosmetic"`
		);
		await queryRunner.query(`ALTER TABLE "user_loadouts" DROP CONSTRAINT "FK_user_loadouts_user"`);

		await queryRunner.query(`DROP INDEX "IDX_entitlements_user_id"`);

		await queryRunner.query(`DROP TABLE "entitlements"`);
		await queryRunner.query(`DROP TABLE "user_loadouts"`);
		await queryRunner.query(`DROP TABLE "cosmetics"`);

		await queryRunner.query(`DROP TYPE "entitlement_source_enum"`);
		await queryRunner.query(`DROP TYPE "grant_type_enum"`);
		await queryRunner.query(`DROP TYPE "cosmetic_tier_enum"`);
		await queryRunner.query(`DROP TYPE "cosmetic_type_enum"`);
	}
}
