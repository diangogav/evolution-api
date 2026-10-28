import type { MigrationInterface, QueryRunner } from "typeorm";

const EVENT_ID = "halloween-2026";

// Prize cosmetics by tier, named by their R2 folder (the unique `asset_ref`).
const PRIZE_TIERS = [
	{ wavesCleared: 3, essence: 150, assetRefs: ["emote-packs/halloween-duelist/"] },
	{
		wavesCleared: 5,
		essence: 250,
		assetRefs: ["avatars/halloween-graveyard/", "sleeves/halloween-graveyard/"],
	},
	{
		wavesCleared: 8,
		essence: 400,
		assetRefs: ["playmats/halloween-graveyard/", "ambience/graveyard-bats/"],
	},
];

const UPDATE_TIERS = `UPDATE "event_catalog" SET "prize_tiers" = $2::jsonb, "updated_at" = now() WHERE "id" = $1`;

/**
 * Fills the halloween-2026 prize tiers with the event cosmetics. Ids are resolved by
 * `asset_ref` when the migration runs; a cosmetic not published yet is left out rather than
 * failing, and can be added later with another UPDATE of `prize_tiers`.
 */
export class AddHalloween2026PrizeCosmetics1782000500000 implements MigrationInterface {
	name = "AddHalloween2026PrizeCosmetics1782000500000";

	async up(queryRunner: QueryRunner): Promise<void> {
		const refs = PRIZE_TIERS.flatMap((tier) => tier.assetRefs);
		const rows: Array<{ id: string; asset_ref: string }> = await queryRunner.query(
			`SELECT "id", "asset_ref" FROM "cosmetics" WHERE "asset_ref" = ANY($1)`,
			[refs],
		);
		const idByRef = new Map(rows.map((row) => [row.asset_ref, row.id]));
		const tiers = PRIZE_TIERS.map(({ wavesCleared, essence, assetRefs }) => ({
			wavesCleared,
			essence,
			cosmeticIds: assetRefs.flatMap((ref) => idByRef.get(ref) ?? []),
		}));
		await queryRunner.query(UPDATE_TIERS, [EVENT_ID, JSON.stringify(tiers)]);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		const tiers = PRIZE_TIERS.map(({ wavesCleared, essence }) => ({
			wavesCleared,
			essence,
			cosmeticIds: [],
		}));
		await queryRunner.query(UPDATE_TIERS, [EVENT_ID, JSON.stringify(tiers)]);
	}
}
