import { describe, expect, it, mock } from "bun:test";
import type { QueryRunner } from "typeorm";

import { AddEventWavePools1782000300000 } from "../../../src/migrations/1782000300000-add-event-wave-pools";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

async function upCalls(): Promise<Array<[string, unknown[] | undefined]>> {
	const query = mock(async (_sql: string, _params?: unknown[]) => undefined);
	await new AddEventWavePools1782000300000().up({ query } as unknown as QueryRunner);
	return query.mock.calls as Array<[string, unknown[] | undefined]>;
}

function catalogUpdate(calls: Array<[string, unknown[] | undefined]>) {
	const call = calls.find(([sql]) => compact(sql).startsWith('UPDATE "event_catalog"'));
	if (!call) throw new Error("no catalog update");
	return call;
}

describe("AddEventWavePools", () => {
	it("adds the drawn rival and faced bots to runs and the bot to reservations", async () => {
		const sql = (await upCalls()).map(([text]) => compact(text)).join("\n");

		expect(sql).toContain(
			`ALTER TABLE "event_runs" ADD "current_bot" character varying(64), ADD "faced_bots" jsonb NOT NULL DEFAULT '[]'`,
		);
		expect(sql).toContain(
			`ALTER TABLE "event_run_reservations" ADD "bot_name" character varying(64)`,
		);
	});

	it("backfills from the old fixed wave list before the catalog is replaced", async () => {
		const calls = (await upCalls()).map(([text]) => compact(text));
		const catalogIndex = calls.findIndex((text) => text.startsWith('UPDATE "event_catalog"'));
		const backfills = calls
			.map((text, index) => ({ text, index }))
			.filter(({ text }) => text.includes("jsonb_typeof(c.waves -> 0) = 'string'"));

		expect(backfills).toHaveLength(3);
		for (const { index } of backfills) expect(index).toBeLessThan(catalogIndex);
	});

	it("gives halloween-2026 eight waves of tiered pools, the player decks as hard rivals", async () => {
		const [sql, params] = catalogUpdate(await upCalls());

		expect(compact(sql)).toContain(`WHERE "id" = $1`);
		expect(params?.[0]).toBe("halloween-2026");
		expect(JSON.parse(params?.[1] as string)).toEqual([
			{ tier: "easy", pool: ["Haunted", "Skeletons", "Horde"] },
			{ tier: "easy", pool: ["Haunted", "Skeletons", "Horde"] },
			{ tier: "medium", pool: ["Archfiends", "Vampires", "Witches"] },
			{ tier: "medium", pool: ["Archfiends", "Vampires", "Witches"] },
			{ tier: "hard", pool: ["DarkWorld", "CursedGarden", "Necromancer"] },
			{ tier: "hard", pool: ["DarkWorld", "CursedGarden", "Necromancer"] },
			{ tier: "miniboss", pool: ["Lich"] },
			{ tier: "boss", pool: ["Gravekeepers"] },
		]);
	});

	it("names the WindBot that pilots each player deck so a run never meets its mirror", async () => {
		const [, params] = catalogUpdate(await upCalls());

		expect(JSON.parse(params?.[2] as string)).toEqual({
			necromancer: "Necromancer",
			"dark-world": "DarkWorld",
			"cursed-garden": "CursedGarden",
		});
	});

	it("restores the fixed wave list on revert", async () => {
		const query = mock(async (_sql: string, _params?: unknown[]) => undefined);
		await new AddEventWavePools1782000300000().down({ query } as unknown as QueryRunner);
		const restore = query.mock.calls.find(([sql]) =>
			compact(sql).startsWith('UPDATE "event_catalog"'),
		);

		expect(JSON.parse(restore?.[1]?.[1] as string)).toEqual([
			"Haunted",
			"Skeletons",
			"Horde",
			"Archfiends",
			"Vampires",
			"Witches",
			"Lich",
			"Gravekeepers",
		]);
		expect(compact(query.mock.calls[query.mock.calls.length - 1]?.[0] ?? "")).toContain(
			'DROP COLUMN "faced_bots"',
		);
	});
});
