import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import {
	BOT_LOADOUT_SEED,
	SeedBotLoadouts1782000100000,
} from "../../../src/migrations/1782000100000-seed-bot-loadouts";

function recordingRunner(): { runner: QueryRunner; calls: { sql: string; params?: unknown[] }[] } {
	const calls: { sql: string; params?: unknown[] }[] = [];
	const runner = {
		query: async (sql: string, params?: unknown[]) => {
			calls.push({ sql, params });
			return [];
		},
	} as unknown as QueryRunner;
	return { runner, calls };
}

describe("SeedBotLoadouts", () => {
	it("seeds the themed loadouts of the main bots by catalog asset_ref", () => {
		expect(BOT_LOADOUT_SEED).toEqual([
			{ botName: "Lich", assetRef: "avatars/halloween-graveyard/" },
			{ botName: "Lich", assetRef: "sleeves/halloween-graveyard/" },
			{ botName: "Gravekeepers", assetRef: "playmats/halloween-graveyard/" },
			{ botName: "Gravekeepers", assetRef: "ambience/graveyard-bats/" },
		]);
	});

	it("inserts only seed rows whose cosmetic exists, taking the slot from the cosmetic", async () => {
		const { runner, calls } = recordingRunner();

		await new SeedBotLoadouts1782000100000().up(runner);

		expect(calls).toHaveLength(1);
		const { sql, params } = calls[0];
		// The inner join drops seed rows with no catalog match, so a missing cosmetic is
		// skipped instead of failing the migration.
		expect(sql).toMatch(/JOIN "cosmetics" c ON c\."asset_ref" = seed\.asset_ref/);
		expect(sql).not.toMatch(/LEFT JOIN/);
		expect(sql).toContain('c."type"');
		expect(sql).toContain("ON CONFLICT");
		expect(sql).toContain("DO NOTHING");
		expect(params).toEqual([
			BOT_LOADOUT_SEED.map((row) => row.botName),
			BOT_LOADOUT_SEED.map((row) => row.assetRef),
		]);
	});

	it("removes only the rows it seeded on revert", async () => {
		const { runner, calls } = recordingRunner();

		await new SeedBotLoadouts1782000100000().down(runner);

		expect(calls).toHaveLength(1);
		expect(calls[0].sql).toContain('DELETE FROM "bot_loadouts"');
		expect(calls[0].params).toEqual([
			BOT_LOADOUT_SEED.map((row) => row.botName),
			BOT_LOADOUT_SEED.map((row) => row.assetRef),
		]);
	});
});
