import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import {
	AddHalloweenBotPlates1782300000000,
	HALLOWEEN_BOT_PLATES,
} from "../../../src/migrations/1782300000000-add-halloween-bot-plates";

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

describe("AddHalloweenBotPlates", () => {
	it("gives every event rival the plate of its playmat", () => {
		const plateOf = (bot: string) =>
			HALLOWEEN_BOT_PLATES.find((plate) => plate.bots.includes(bot))?.id;
		expect(plateOf("Horde")).toBe("halloween-wave-easy");
		expect(plateOf("Witches")).toBe("halloween-wave-medium");
		expect(plateOf("Necromancer")).toBe("halloween-wave-hard");
		expect(plateOf("Lich")).toBe("halloween-lich");
		expect(plateOf("Gravekeepers")).toBe("halloween-gravekeepers");
		expect(HALLOWEEN_BOT_PLATES.flatMap((plate) => plate.bots)).toHaveLength(11);
	});

	it("inserts inactive LANE rows and replaces each bot's lane slot", async () => {
		const { runner, calls } = recordingRunner();

		await new AddHalloweenBotPlates1782300000000().up(runner);

		expect(calls).toHaveLength(2);
		expect(calls[0].sql).toContain("'LANE'::cosmetic_type_enum");
		expect(calls[0].sql).toContain("false");
		expect(calls[0].sql).toContain("ARRAY['plate.json']");
		expect(calls[0].params?.[0]).toEqual(HALLOWEEN_BOT_PLATES.map((plate) => `lanes/${plate.id}/`));
		expect(calls[1].sql).toContain("DO UPDATE");
		expect((calls[1].params?.[0] as string[]).length).toBe(11);
	});

	it("removes its slots and only the inactive plates it added on revert", async () => {
		const { runner, calls } = recordingRunner();

		await new AddHalloweenBotPlates1782300000000().down(runner);

		expect(calls).toHaveLength(2);
		expect(calls[0].sql).toContain('DELETE FROM "bot_loadouts"');
		expect(calls[1].sql).toContain('"active" = false');
	});
});
