import { describe, expect, it, mock } from "bun:test";
import type { QueryRunner } from "typeorm";

import { CreateAdventCalendar1783300000000 } from "../../../src/migrations/1783300000000-create-advent-calendar";
import { AddAdventCalendarEssenceKind1783300100000 } from "../../../src/migrations/1783300100000-add-advent-calendar-essence-kind";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

async function statements(run: (runner: QueryRunner) => Promise<void>): Promise<string[]> {
	const query = mock(async (_sql: string, _params?: unknown[]) => undefined);
	await run({ query } as unknown as QueryRunner);
	return query.mock.calls.map(([sql]) => compact(sql));
}

describe("CreateAdventCalendar", () => {
	const migration = new CreateAdventCalendar1783300000000();

	it("creates the catalog, the door progress, the reservations and the applied-duel gate", async () => {
		const sql = await statements((runner) => migration.up(runner));

		expect(sql).toHaveLength(5);
		expect(sql[0]).toStartWith('CREATE TABLE "advent_calendar_catalog"');
		expect(sql[1]).toStartWith('CREATE TABLE "advent_doors"');
		expect(sql[2]).toStartWith('CREATE TABLE "advent_reservations"');
		expect(sql[3]).toStartWith('CREATE INDEX "IDX_advent_reservations_door"');
		expect(sql[4]).toStartWith('CREATE TABLE "advent_duels"');
	});

	it("keeps one row per player and door, so a door is cleared, rolled and recovered once", async () => {
		const [, doors] = await statements((runner) => migration.up(runner));

		expect(doors).toContain('PRIMARY KEY ("user_id", "calendar_id", "day")');
		expect(doors).toContain('CHECK ("die_roll" BETWEEN 1 AND 6)');
		expect(doors).toContain('CHECK ("attempts" >= 0)');
		expect(doors).toContain('REFERENCES "users"("id") ON DELETE CASCADE');
	});

	it("applies each reservation at most once", async () => {
		const sql = await statements((runner) => migration.up(runner));
		expect(sql[4]).toContain('CONSTRAINT "PK_advent_duels" PRIMARY KEY ("reservation_id")');
	});

	it("only creates new tables: no existing table is altered or written", async () => {
		const sql = await statements((runner) => migration.up(runner));
		for (const statement of sql) expect(statement).toMatch(/^CREATE (TABLE|INDEX) "(IDX_)?advent_/);
	});

	it("drops its tables in reverse dependency order", async () => {
		expect(await statements((runner) => migration.down(runner))).toEqual([
			'DROP TABLE "advent_duels"',
			'DROP TABLE "advent_reservations"',
			'DROP TABLE "advent_doors"',
			'DROP TABLE "advent_calendar_catalog"',
		]);
	});
});

describe("AddAdventCalendarEssenceKind", () => {
	const migration = new AddAdventCalendarEssenceKind1783300100000();

	it("adds the ledger kind in its own migration and never fails when it is already there", async () => {
		expect(await statements((runner) => migration.up(runner))).toEqual([
			`ALTER TYPE "essence_ledger_kind_enum" ADD VALUE IF NOT EXISTS 'advent_calendar'`,
		]);
	});

	it("leaves the value in place on revert", async () => {
		expect(await statements(() => migration.down())).toEqual([]);
	});
});
