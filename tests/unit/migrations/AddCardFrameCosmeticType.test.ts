import { describe, expect, it } from "bun:test";
import type { QueryRunner } from "typeorm";

import { AddCardFrameCosmeticType1782600000000 } from "../../../src/migrations/1782600000000-add-card-frame-cosmetic-type";

function recordingRunner(): { runner: QueryRunner; calls: string[] } {
	const calls: string[] = [];
	const runner = {
		query: async (sql: string) => {
			calls.push(sql);
			return [];
		},
	} as unknown as QueryRunner;
	return { runner, calls };
}

describe("AddCardFrameCosmeticType", () => {
	it("only adds the CARD_FRAME enum value", async () => {
		const { runner, calls } = recordingRunner();

		await new AddCardFrameCosmeticType1782600000000().up(runner);

		expect(calls).toEqual([`ALTER TYPE "cosmetic_type_enum" ADD VALUE IF NOT EXISTS 'CARD_FRAME'`]);
	});

	it("removes CARD_FRAME rows on revert and leaves the enum value in place", async () => {
		const { runner, calls } = recordingRunner();

		await new AddCardFrameCosmeticType1782600000000().down(runner);

		expect(calls).toEqual([
			`DELETE FROM "user_loadouts" WHERE "cosmetic_type" = 'CARD_FRAME'`,
			`DELETE FROM "cosmetics" WHERE "type" = 'CARD_FRAME'`,
		]);
	});
});
