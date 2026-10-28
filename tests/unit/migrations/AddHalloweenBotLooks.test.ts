import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import {
	AddHalloweenBotLooks1782200000000,
	HALLOWEEN_BOT_COSMETICS,
	HALLOWEEN_BOT_LOOKS,
} from "../../../src/migrations/1782200000000-add-halloween-bot-looks";

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

const lookOf = (botName: string) =>
	HALLOWEEN_BOT_LOOKS.filter((row) => row.botName === botName).map((row) => row.assetRef);

describe("AddHalloweenBotLooks", () => {
	it("adds 11 avatars, 5 sleeves and 5 playmats", () => {
		const count = (type: string) =>
			HALLOWEEN_BOT_COSMETICS.filter((row) => row.type === type).length;
		expect(count("AVATAR")).toBe(11);
		expect(count("SLEEVE")).toBe(5);
		expect(count("PLAYMAT")).toBe(5);
		expect(new Set(HALLOWEEN_BOT_COSMETICS.map((row) => row.assetRef)).size).toBe(21);
	});

	it("dresses a tier bot in its own avatar and the tier's sleeve and playmat", () => {
		expect(lookOf("Horde")).toEqual([
			"avatars/bot-horde/",
			"sleeves/halloween-wave-easy/",
			"playmats/halloween-wave-easy/",
		]);
		expect(lookOf("Witches")).toEqual([
			"avatars/bot-witches/",
			"sleeves/halloween-wave-medium/",
			"playmats/halloween-wave-medium/",
		]);
		expect(lookOf("DarkWorld")).toEqual([
			"avatars/bot-dark-world/",
			"sleeves/halloween-wave-hard/",
			"playmats/halloween-wave-hard/",
		]);
	});

	it("gives each boss its own sleeve and playmat", () => {
		expect(lookOf("Lich")).toEqual([
			"avatars/bot-lich/",
			"sleeves/halloween-lich/",
			"playmats/halloween-lich/",
		]);
		expect(lookOf("Gravekeepers")).toEqual([
			"avatars/bot-gravekeepers/",
			"sleeves/halloween-gravekeepers/",
			"playmats/halloween-gravekeepers/",
		]);
	});

	it("covers every rival of the event pools and only cosmetics it adds", () => {
		const bots = new Set(HALLOWEEN_BOT_LOOKS.map((row) => row.botName));
		expect([...bots].sort()).toEqual(
			[
				"Archfiends",
				"CursedGarden",
				"DarkWorld",
				"Gravekeepers",
				"Haunted",
				"Horde",
				"Lich",
				"Necromancer",
				"Skeletons",
				"Vampires",
				"Witches",
			].sort(),
		);
		const added = new Set(HALLOWEEN_BOT_COSMETICS.map((row) => row.assetRef));
		expect(HALLOWEEN_BOT_LOOKS.every((row) => added.has(row.assetRef))).toBe(true);
	});

	it("inserts the cosmetics inactive and replaces each bot's slot", async () => {
		const { runner, calls } = recordingRunner();

		await new AddHalloweenBotLooks1782200000000().up(runner);

		expect(calls).toHaveLength(2);
		expect(calls[0].sql).toContain('INSERT INTO "cosmetics"');
		expect(calls[0].sql).toContain("false");
		expect(calls[0].sql).toContain('ON CONFLICT ("asset_ref") DO NOTHING');
		expect(calls[1].sql).toContain('INSERT INTO "bot_loadouts"');
		expect(calls[1].sql).toContain("DO UPDATE");
		expect(calls[1].params).toEqual([
			HALLOWEEN_BOT_LOOKS.map((row) => row.botName),
			HALLOWEEN_BOT_LOOKS.map((row) => row.assetRef),
		]);
	});

	it("restores the bosses' prize looks and drops only inactive rows on revert", async () => {
		const { runner, calls } = recordingRunner();

		await new AddHalloweenBotLooks1782200000000().down(runner);

		expect(calls).toHaveLength(3);
		expect(calls[0].sql).toContain('DELETE FROM "bot_loadouts"');
		expect(calls[1].params).toEqual([
			["Lich", "Lich", "Gravekeepers"],
			[
				"avatars/halloween-graveyard/",
				"sleeves/halloween-graveyard/",
				"playmats/halloween-graveyard/",
			],
		]);
		expect(calls[2].sql).toContain('"active" = false');
	});
});
