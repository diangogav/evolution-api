import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import {
	Halloween2026LanternPrizes1782400000000,
	LANTERN_PRIZE_TIERS,
} from "../../../src/migrations/1782400000000-halloween-2026-lantern-prizes";

function recordingRunner(rows: { id: string; asset_ref: string }[] = []) {
	const calls: { sql: string; params?: unknown[] }[] = [];
	const runner = {
		query: async (sql: string, params?: unknown[]) => {
			calls.push({ sql, params });
			return sql.startsWith('SELECT "id", "asset_ref"') ? rows : [];
		},
	} as unknown as QueryRunner;
	return { runner, calls };
}

describe("Halloween2026LanternPrizes", () => {
	it("pays the Veil Cemetery set at 3 waves, the Candle Crypt set at 5 and the Lantern Road set at 8", () => {
		expect(
			LANTERN_PRIZE_TIERS.map((tier) => [tier.wavesCleared, tier.essence, tier.assetRefs]),
		).toEqual([
			[3, 150, ["sleeves/halloween-wave-easy/", "playmats/halloween-wave-easy/"]],
			[5, 250, ["sleeves/halloween-wave-medium/", "playmats/halloween-wave-medium/"]],
			[8, 400, ["playmats/lantern-road/", "ambience/lantern-road/"]],
		]);
	});

	it("activates the bot looks, adds the final prize, rewrites the tiers and grants past winners", async () => {
		const { runner, calls } = recordingRunner([
			{ id: "easy-sleeve", asset_ref: "sleeves/halloween-wave-easy/" },
			{ id: "lantern-playmat", asset_ref: "playmats/lantern-road/" },
		]);

		await new Halloween2026LanternPrizes1782400000000().up(runner);

		expect(calls[0].sql).toContain('SET "active" = true');
		expect(calls[1].sql).toContain("'EXCLUSIVE'::cosmetic_tier_enum");
		const tiers = JSON.parse(calls[3].params?.[1] as string);
		// A cosmetic missing from the catalog is left out instead of failing.
		expect(tiers.map((tier: { cosmeticIds: string[] }) => tier.cosmeticIds)).toEqual([
			["easy-sleeve"],
			[],
			["lantern-playmat"],
		]);
		const grant = calls[4];
		expect(grant.sql).toContain('JOIN "essence_ledger"');
		expect(grant.sql).toContain("NOT EXISTS");
		expect(grant.params?.[0]).toEqual([
			"event:halloween-2026:tier:3",
			"event:halloween-2026:tier:3",
			"event:halloween-2026:tier:5",
			"event:halloween-2026:tier:5",
			"event:halloween-2026:tier:8",
			"event:halloween-2026:tier:8",
		]);
	});

	it("restores the previous prize tiers on revert", async () => {
		const { runner, calls } = recordingRunner([
			{ id: "graveyard-playmat", asset_ref: "playmats/halloween-graveyard/" },
		]);

		await new Halloween2026LanternPrizes1782400000000().down(runner);

		const update = calls.find((call) => call.sql.startsWith('UPDATE "event_catalog"'));
		const tiers = JSON.parse(update?.params?.[1] as string);
		expect(tiers[2].cosmeticIds).toEqual(["graveyard-playmat"]);
		expect(calls[calls.length - 1]?.sql).toContain('SET "active" = false');
	});
});
