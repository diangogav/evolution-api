import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import { AddLightningEssenceKind1782800100000 } from "../../../src/migrations/1782800100000-add-lightning-essence-kind";
import { CreateLightningTournaments1782800000000 } from "../../../src/migrations/1782800000000-create-lightning-tournaments";
import { AddLightningSwiss1782900000000 } from "../../../src/migrations/1782900000000-add-lightning-swiss";
import { AddLightningResultAchievements1783000000000 } from "../../../src/migrations/1783000000000-add-lightning-result-achievements";

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

describe("AddLightningSwiss migration", () => {
	it("adds the Swiss columns with arena defaults, the game round and the byes table", async () => {
		const { runner, statements } = recordingRunner();

		await new AddLightningSwiss1782900000000().up(runner);

		const sql = statements.join("\n");
		expect(sql).toContain(`ADD "system" character varying(16) NOT NULL DEFAULT 'arena'`);
		expect(sql).toContain(`CHECK ("system" IN ('arena', 'swiss'))`);
		expect(sql).toContain(`ADD "current_round" integer NOT NULL DEFAULT 0`);
		expect(sql).toContain(`ADD "round_minutes" integer NOT NULL DEFAULT 40`);
		expect(sql).toContain(`ADD "round_break_seconds" integer NOT NULL DEFAULT 60`);
		expect(sql).toContain(`ADD "round_started_at" TIMESTAMP WITH TIME ZONE`);
		expect(sql).toContain(`ALTER TABLE "lightning_games" ADD "round" integer`);
		expect(createdTables(statements)).toEqual(["lightning_byes"]);
		const byes = statements.find((s) => s.includes(`CREATE TABLE "lightning_byes"`)) ?? "";
		expect(byes).toContain('PRIMARY KEY ("tournament_id", "user_id", "round")');
		expect(byes).toContain('REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE');
		expect(byes).toContain('REFERENCES "users"("id") ON DELETE CASCADE');
	});

	it("drops the byes table first and every added column on revert", async () => {
		const { runner, statements } = recordingRunner();

		await new AddLightningSwiss1782900000000().down(runner);

		expect(statements[0]).toBe(`DROP TABLE "lightning_byes"`);
		const sql = statements.join("\n");
		for (const column of [
			"system",
			"rounds",
			"current_round",
			"round_minutes",
			"round_break_seconds",
			"round_started_at",
			"round_closed_at",
		]) {
			expect(sql).toContain(`DROP COLUMN "${column}"`);
		}
		expect(sql).toContain(`ALTER TABLE "lightning_games" DROP COLUMN "round"`);
	});
});

describe("AddLightningResultAchievements migration", () => {
	it("adds the unlocked achievements to results, empty for existing rows, and drops them on revert", async () => {
		const up = recordingRunner();
		const down = recordingRunner();

		await new AddLightningResultAchievements1783000000000().up(up.runner);
		await new AddLightningResultAchievements1783000000000().down(down.runner);

		expect(up.statements).toEqual([
			`ALTER TABLE "lightning_results" ADD "achievements" jsonb NOT NULL DEFAULT '[]'::jsonb`,
		]);
		expect(down.statements).toEqual([`ALTER TABLE "lightning_results" DROP COLUMN "achievements"`]);
	});
});
