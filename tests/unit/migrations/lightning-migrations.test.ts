import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import { AddLightningEssenceKind1782800100000 } from "../../../src/migrations/1782800100000-add-lightning-essence-kind";
import { CreateLightningTournaments1782800000000 } from "../../../src/migrations/1782800000000-create-lightning-tournaments";

function recordingRunner() {
	const statements: string[] = [];
	const runner = { query: async (sql: string) => statements.push(sql) } as unknown as QueryRunner;
	return { runner, statements };
}

const createdTables = (statements: string[]) =>
	statements
		.map((sql) => /CREATE TABLE "?([a-z_]+)"?/.exec(sql)?.[1])
		.filter((name): name is string => name !== undefined);

describe("CreateLightningTournaments migration", () => {
	it("creates the five API-owned lightning tables and drops them in reverse", async () => {
		const up = recordingRunner();
		const down = recordingRunner();

		await new CreateLightningTournaments1782800000000().up(up.runner);
		await new CreateLightningTournaments1782800000000().down(down.runner);

		expect(createdTables(up.statements)).toEqual([
			"lightning_tournaments",
			"lightning_entries",
			"lightning_games",
			"lightning_results",
			"lightning_rankings",
		]);
		const dropped = down.statements
			.map((sql) => /DROP TABLE "?([a-z_]+)"?/.exec(sql)?.[1])
			.filter((name): name is string => name !== undefined);
		expect(dropped).toEqual([...createdTables(up.statements)].reverse());
	});

	it("keys entries and results per tournament and player, games per reservation, rankings per user and season", async () => {
		const { runner, statements } = recordingRunner();

		await new CreateLightningTournaments1782800000000().up(runner);

		const table = (name: string) =>
			statements.find((sql) => sql.includes(`CREATE TABLE "${name}"`)) ?? "";
		expect(table("lightning_entries")).toContain('PRIMARY KEY ("tournament_id", "user_id")');
		expect(table("lightning_results")).toContain('PRIMARY KEY ("tournament_id", "user_id")');
		expect(table("lightning_games")).toContain('PRIMARY KEY ("reservation_id")');
		expect(table("lightning_rankings")).toContain('UNIQUE ("user_id", "season")');
		expect(table("lightning_tournaments")).toContain('"turn_time_seconds" >= 60');
		expect(table("lightning_tournaments")).toContain('"turn_time_seconds" <= 998');
		expect(table("lightning_entries")).toContain('REFERENCES "users"("id")');
	});
});

describe("AddLightningEssenceKind migration", () => {
	it("adds the enum value in its own statement and leaves it on revert", async () => {
		const up = recordingRunner();
		const down = recordingRunner();

		await new AddLightningEssenceKind1782800100000().up(up.runner);
		await new AddLightningEssenceKind1782800100000().down();

		expect(up.statements).toEqual([
			`ALTER TYPE "essence_ledger_kind_enum" ADD VALUE IF NOT EXISTS 'lightning_tournament'`,
		]);
		expect(down.statements).toEqual([]);
	});
});
