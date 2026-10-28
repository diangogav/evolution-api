import { describe, expect, it, mock } from "bun:test";
import type { QueryRunner } from "typeorm";

import { SeedHalloween2026Event1782000200000 } from "../../../src/migrations/1782000200000-seed-halloween-2026-event";

async function seededParams(): Promise<unknown[]> {
	const query = mock(async (_sql: string, _params?: unknown[]) => undefined);
	await new SeedHalloween2026Event1782000200000().up({ query } as unknown as QueryRunner);
	expect(query).toHaveBeenCalledTimes(1);
	return query.mock.calls[0][1] as unknown[];
}

describe("SeedHalloween2026Event", () => {
	it("seeds halloween-2026: edison, 3 attempts a day, the eight waves in order", async () => {
		const [id, name, , format, , , attempts, waves] = await seededParams();

		expect(id).toBe("halloween-2026");
		expect(JSON.parse(name as string)).toEqual({ en: "Halloween Horde", es: "Horda de Halloween" });
		expect(format).toBe("edison");
		expect(attempts).toBe(3);
		expect(JSON.parse(waves as string)).toEqual([
			"Haunted",
			"Skeletons",
			"Horde",
			"Archfiends",
			"Vampires",
			"Witches",
			"Lich",
			"Gravekeepers",
		]);
	});

	it("seeds the three player decks with 40-card mains and localized names", async () => {
		const params = await seededParams();
		const decks = JSON.parse(params[8] as string) as Array<{
			id: string;
			name: { en: string; es: string };
			main: number[];
			extra: number[];
		}>;

		expect(decks.map((deck) => deck.id)).toEqual(["necromancer", "dark-world", "cursed-garden"]);
		for (const deck of decks) {
			expect(deck.main).toHaveLength(40);
			expect(deck.extra.length).toBeGreaterThan(0);
			expect(deck.extra.length).toBeLessThanOrEqual(15);
			expect(deck.name.es.length).toBeGreaterThan(0);
		}
	});

	it("seeds prize tiers 3/5/8 paying 150/250/400 essence with empty cosmetic slots", async () => {
		const params = await seededParams();

		expect(JSON.parse(params[9] as string)).toEqual([
			{ wavesCleared: 3, essence: 150, cosmeticIds: [] },
			{ wavesCleared: 5, essence: 250, cosmeticIds: [] },
			{ wavesCleared: 8, essence: 400, cosmeticIds: [] },
		]);
	});
});
