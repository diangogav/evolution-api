import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import { AddLightningChat1783100000000 } from "../../../src/migrations/1783100000000-add-lightning-chat";

function recordingRunner() {
	const statements: string[] = [];
	const runner = { query: async (sql: string) => statements.push(sql) } as unknown as QueryRunner;
	return { runner, statements };
}

describe("AddLightningChat migration", () => {
	it("creates the chat table keyed by a bigserial id and cascading with its tournament and author", async () => {
		const { runner, statements } = recordingRunner();

		await new AddLightningChat1783100000000().up(runner);

		const table = statements.find((sql) => sql.includes(`CREATE TABLE "lightning_chat_messages"`));
		expect(table).toBeDefined();
		expect(table).toContain(`"id" BIGSERIAL NOT NULL`);
		expect(table).toContain(`CONSTRAINT "PK_lightning_chat_messages" PRIMARY KEY ("id")`);
		expect(table).toContain(
			`FOREIGN KEY ("tournament_id") REFERENCES "lightning_tournaments"("id") ON DELETE CASCADE`,
		);
		expect(table).toContain(`"user_id" character varying NOT NULL`);
		expect(table).toContain(`FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`);
		expect(table).toContain(`"body" character varying(200) NOT NULL`);
		expect(table).toContain(`CHECK (char_length("body") BETWEEN 1 AND 200)`);
		expect(table).toContain(`"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
		expect(table).toContain(`"deleted_at" TIMESTAMP WITH TIME ZONE,`);
		expect(table).toContain(`"deleted_by" character varying,`);
	});

	it("indexes messages by tournament and id for range scans", async () => {
		const { runner, statements } = recordingRunner();

		await new AddLightningChat1783100000000().up(runner);

		expect(statements).toContain(
			`CREATE INDEX "IDX_lightning_chat_messages_tournament_id" ON "lightning_chat_messages" ("tournament_id", "id")`,
		);
	});

	it("drops the table on revert", async () => {
		const { runner, statements } = recordingRunner();

		await new AddLightningChat1783100000000().down(runner);

		expect(statements).toEqual([`DROP TABLE "lightning_chat_messages"`]);
	});
});
