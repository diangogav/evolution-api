import { describe, expect, it, mock } from "bun:test";
import type { QueryRunner } from "typeorm";

import { CreateCommunityDecks1782500000000 } from "../../../src/migrations/1782500000000-create-community-decks";

async function calls(direction: "up" | "down"): Promise<string[]> {
	const query = mock(async (_sql: string) => undefined);
	await new CreateCommunityDecks1782500000000()[direction]({ query } as unknown as QueryRunner);
	return query.mock.calls.map(([sql]) => sql);
}

describe("CreateCommunityDecks", () => {
	it("creates the table with one row per source deck", async () => {
		const [create] = await calls("up");

		expect(create).toContain(`CREATE TABLE "community_decks"`);
		expect(create).toContain(
			`CONSTRAINT "UQ_community_decks_source" UNIQUE ("source", "source_id")`,
		);
		for (const column of [
			`"url" text NOT NULL`,
			`"author" text NOT NULL`,
			`"name" text NOT NULL`,
			`"format" character varying(64) NOT NULL`,
			`"cover_card" integer NOT NULL`,
			`"main" integer[] NOT NULL`,
			`"views" integer NOT NULL`,
			`"source_updated_at" TIMESTAMP WITH TIME ZONE,`,
			`"synced_at" TIMESTAMP WITH TIME ZONE NOT NULL`,
		]) {
			expect(create).toContain(column);
		}
	});

	it("drops everything it created on revert", async () => {
		const down = await calls("down");

		expect(down[down.length - 1]).toBe(`DROP TABLE "community_decks"`);
		expect(down).toHaveLength(3);
	});
});
