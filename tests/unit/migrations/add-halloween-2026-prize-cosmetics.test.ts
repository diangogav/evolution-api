import { describe, expect, it, mock } from "bun:test";
import type { QueryRunner } from "typeorm";

import { AddHalloween2026PrizeCosmetics1782000500000 } from "../../../src/migrations/1782000500000-add-halloween-2026-prize-cosmetics";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

type Call = [string, unknown[] | undefined];

// Answers the asset_ref lookup with the cosmetics present in the catalog.
function runner(catalog: Record<string, string>) {
	const query = mock(async (sql: string, params?: unknown[]) => {
		if (compact(sql).startsWith('SELECT "id", "asset_ref" FROM "cosmetics"')) {
			const refs = (params?.[0] ?? []) as string[];
			return refs
				.filter((ref) => ref in catalog)
				.map((ref) => ({ id: catalog[ref], asset_ref: ref }));
		}
		return undefined;
	});
	return { query, queryRunner: { query } as unknown as QueryRunner };
}

function tiersWritten(calls: Call[]) {
	const update = calls.find(([sql]) => compact(sql).startsWith('UPDATE "event_catalog"'));
	if (!update) throw new Error("no catalog update");
	expect(update[1]?.[0]).toBe("halloween-2026");
	return JSON.parse(update[1]?.[1] as string);
}

const FULL_CATALOG = {
	"emote-packs/halloween-duelist/": "id-emotes",
	"avatars/halloween-graveyard/": "id-avatar",
	"sleeves/halloween-graveyard/": "id-sleeves",
	"playmats/halloween-graveyard/": "id-playmat",
	"ambience/graveyard-bats/": "id-ambience",
};

describe("AddHalloween2026PrizeCosmetics", () => {
	it("resolves each tier's cosmetics by asset_ref, keeping the essence", async () => {
		const { query, queryRunner } = runner(FULL_CATALOG);

		await new AddHalloween2026PrizeCosmetics1782000500000().up(queryRunner);

		expect(tiersWritten(query.mock.calls as Call[])).toEqual([
			{ wavesCleared: 3, essence: 150, cosmeticIds: ["id-emotes"] },
			{ wavesCleared: 5, essence: 250, cosmeticIds: ["id-avatar", "id-sleeves"] },
			{ wavesCleared: 8, essence: 400, cosmeticIds: ["id-playmat", "id-ambience"] },
		]);
	});

	it("skips a cosmetic missing from the catalog instead of failing", async () => {
		const { "sleeves/halloween-graveyard/": _sleeves, ...partial } = FULL_CATALOG;
		const { query, queryRunner } = runner(partial);

		await new AddHalloween2026PrizeCosmetics1782000500000().up(queryRunner);

		expect(tiersWritten(query.mock.calls as Call[])[1]).toEqual({
			wavesCleared: 5,
			essence: 250,
			cosmeticIds: ["id-avatar"],
		});
	});

	it("restores the essence-only tiers on revert", async () => {
		const { query, queryRunner } = runner(FULL_CATALOG);

		await new AddHalloween2026PrizeCosmetics1782000500000().down(queryRunner);

		expect(tiersWritten(query.mock.calls as Call[])).toEqual([
			{ wavesCleared: 3, essence: 150, cosmeticIds: [] },
			{ wavesCleared: 5, essence: 250, cosmeticIds: [] },
			{ wavesCleared: 8, essence: 400, cosmeticIds: [] },
		]);
	});
});
