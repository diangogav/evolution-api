import type { MigrationInterface, QueryRunner } from "typeorm";

const EVENT_ID = "halloween-2026";

type PrizeCosmetic = { assetRef: string; displayName: string };

// Bot looks that become prizes: they were inactive rows, now they are owned by the winners
// (EXCLUSIVE, so only they can see and equip them) while the bots keep wearing them.
const ACTIVATED: readonly PrizeCosmetic[] = [
	{ assetRef: "sleeves/halloween-wave-easy/", displayName: "Funda Cementerio del Velo" },
	{ assetRef: "playmats/halloween-wave-easy/", displayName: "Tablero Cementerio del Velo" },
	{ assetRef: "sleeves/halloween-wave-medium/", displayName: "Funda Cripta de las Velas" },
	{ assetRef: "playmats/halloween-wave-medium/", displayName: "Tablero Cripta de las Velas" },
];

// The final prize, new art no bot wears.
const ADDED: readonly (PrizeCosmetic & { type: "PLAYMAT" | "AMBIENCE"; file: string })[] = [
	{
		assetRef: "playmats/lantern-road/",
		displayName: "Tablero Camino de los Faroles",
		type: "PLAYMAT",
		file: "background.webp",
	},
	{
		assetRef: "ambience/lantern-road/",
		displayName: "Faroles del Camino",
		type: "AMBIENCE",
		file: "ambience.json",
	},
];

export const LANTERN_PRIZE_TIERS = [
	{
		wavesCleared: 3,
		essence: 150,
		assetRefs: ["sleeves/halloween-wave-easy/", "playmats/halloween-wave-easy/"],
	},
	{
		wavesCleared: 5,
		essence: 250,
		assetRefs: ["sleeves/halloween-wave-medium/", "playmats/halloween-wave-medium/"],
	},
	{
		wavesCleared: 8,
		essence: 400,
		assetRefs: ["playmats/lantern-road/", "ambience/lantern-road/"],
	},
] as const;

// The tiers as 1782000500000 set them, restored on revert.
const PREVIOUS_PRIZE_TIERS = [
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

const ACTIVATE = `UPDATE "cosmetics" AS c SET "active" = true, "display_name" = row.display_name, "updated_at" = now()
FROM unnest($1::varchar[], $2::varchar[]) AS row(asset_ref, display_name)
WHERE c."asset_ref" = row.asset_ref`;

const INSERT_ADDED = `INSERT INTO "cosmetics" ("type", "tier", "asset_ref", "display_name", "active", "asset_files")
SELECT row.type::cosmetic_type_enum, 'EXCLUSIVE'::cosmetic_tier_enum, row.asset_ref, row.display_name, true, ARRAY[row.file]
FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[]) AS row(asset_ref, display_name, type, file)
ON CONFLICT ("asset_ref") DO NOTHING`;

const UPDATE_TIERS = `UPDATE "event_catalog" SET "prize_tiers" = $2::jsonb, "updated_at" = now() WHERE "id" = $1`;

// Players who already crossed a tier before its cosmetics changed: the essence ledger keeps
// one row per (user, tier) paid, so each of them gets that tier's cosmetics now. An active
// grant of the same cosmetic is never duplicated.
const GRANT_PAST_WINNERS = `INSERT INTO "entitlements" ("user_id", "grant_type", "grant_value", "source")
SELECT DISTINCT l."user_id", 'COSMETIC'::grant_type_enum, c."id"::text, 'CAMPAIGN'::entitlement_source_enum
FROM unnest($1::varchar[], $2::varchar[]) AS prize(reference_key, asset_ref)
JOIN "essence_ledger" l ON l."reference_key" = prize.reference_key
JOIN "cosmetics" c ON c."asset_ref" = prize.asset_ref
WHERE NOT EXISTS (
	SELECT 1 FROM "entitlements" e
	WHERE e."user_id" = l."user_id" AND e."grant_type" = 'COSMETIC' AND e."grant_value" = c."id"::text
		AND (e."expires_at" IS NULL OR e."expires_at" > now())
)`;

async function tiersWithIds(
	queryRunner: QueryRunner,
	tiers: readonly { wavesCleared: number; essence: number; assetRefs: readonly string[] }[],
) {
	const refs = tiers.flatMap((tier) => tier.assetRefs);
	const rows: Array<{ id: string; asset_ref: string }> = await queryRunner.query(
		`SELECT "id", "asset_ref" FROM "cosmetics" WHERE "asset_ref" = ANY($1)`,
		[refs],
	);
	const idByRef = new Map(rows.map((row) => [row.asset_ref, row.id]));
	return tiers.map(({ wavesCleared, essence, assetRefs }) => ({
		wavesCleared,
		essence,
		cosmeticIds: assetRefs.flatMap((ref) => idByRef.get(ref) ?? []),
	}));
}

function pastWinnerParams(): [string[], string[]] {
	const pairs = LANTERN_PRIZE_TIERS.flatMap((tier) =>
		tier.assetRefs.map((assetRef) => ({
			referenceKey: `event:${EVENT_ID}:tier:${tier.wavesCleared}`,
			assetRef,
		})),
	);
	return [pairs.map((pair) => pair.referenceKey), pairs.map((pair) => pair.assetRef)];
}

/**
 * Halloween 2026 prizes become the Lantern Road set: the Veil Cemetery sleeve and playmat at
 * 3 waves, the Candle Crypt ones at 5, and the new Lantern Road playmat and ambience at 8.
 * Players who already crossed a tier receive its cosmetics.
 */
export class Halloween2026LanternPrizes1782400000000 implements MigrationInterface {
	name = "Halloween2026LanternPrizes1782400000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(ACTIVATE, [
			ACTIVATED.map((row) => row.assetRef),
			ACTIVATED.map((row) => row.displayName),
		]);
		await queryRunner.query(INSERT_ADDED, [
			ADDED.map((row) => row.assetRef),
			ADDED.map((row) => row.displayName),
			ADDED.map((row) => row.type),
			ADDED.map((row) => row.file),
		]);
		const tiers = await tiersWithIds(queryRunner, LANTERN_PRIZE_TIERS);
		await queryRunner.query(UPDATE_TIERS, [EVENT_ID, JSON.stringify(tiers)]);
		await queryRunner.query(GRANT_PAST_WINNERS, pastWinnerParams());
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		const refs = [...ACTIVATED, ...ADDED].map((row) => row.assetRef);
		// Prize grants of these cosmetics only ever came from this event.
		await queryRunner.query(
			`DELETE FROM "user_loadouts" WHERE "cosmetic_id" IN (SELECT "id" FROM "cosmetics" WHERE "asset_ref" = ANY($1))`,
			[refs],
		);
		await queryRunner.query(
			`DELETE FROM "entitlements" WHERE "grant_type" = 'COSMETIC' AND "source" = 'CAMPAIGN' AND "grant_value" IN (SELECT "id"::text FROM "cosmetics" WHERE "asset_ref" = ANY($1))`,
			[refs],
		);
		const tiers = await tiersWithIds(queryRunner, PREVIOUS_PRIZE_TIERS);
		await queryRunner.query(UPDATE_TIERS, [EVENT_ID, JSON.stringify(tiers)]);
		await queryRunner.query(`DELETE FROM "cosmetics" WHERE "asset_ref" = ANY($1)`, [
			ADDED.map((row) => row.assetRef),
		]);
		await queryRunner.query(
			`UPDATE "cosmetics" SET "active" = false, "updated_at" = now() WHERE "asset_ref" = ANY($1)`,
			[ACTIVATED.map((row) => row.assetRef)],
		);
	}
}
