import { MigrationInterface, QueryRunner } from "typeorm";

// Promote the three premium sleeves (baby-frog, kagura, mystical-witch) to
// REGISTERED so anonymous players no longer see or equip them — they now require
// an account. These rows were already seeded as STANDARD; the seed only INSERTS
// missing rows (matched by asset_ref) and never updates an existing tier, so this
// change MUST be a data migration. The new STANDARD sleeves (evolution,
// evolution-black) are inserted by the seed, not here.
export class SetSleeveTiers1781016036903 implements MigrationInterface {
	name = "SetSleeveTiers1781016036903";

	private readonly refs = [
		"sleeves/baby-frog/",
		"sleeves/kagura/",
		"sleeves/mystical-witch/",
	];

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`UPDATE "cosmetics" SET "tier" = 'REGISTERED', "updated_at" = now() WHERE "asset_ref" = ANY($1)`,
			[this.refs],
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`UPDATE "cosmetics" SET "tier" = 'STANDARD', "updated_at" = now() WHERE "asset_ref" = ANY($1)`,
			[this.refs],
		);
	}
}
