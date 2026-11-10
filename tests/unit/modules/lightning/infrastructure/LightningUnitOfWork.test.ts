import { describe, expect, it, mock } from "bun:test";

import { LightningUnitOfWork } from "../../../../../src/modules/lightning/infrastructure/LightningUnitOfWork";

function recordingManager() {
	return { query: mock(async (_sql: string) => []) };
}

describe("LightningUnitOfWork.savepoint", () => {
	it("releases the savepoint after a successful item", async () => {
		const manager = recordingManager();

		expect(await new LightningUnitOfWork().savepoint(manager, async () => 3)).toBe(3);

		expect(manager.query.mock.calls.map(([sql]) => sql)).toEqual([
			"SAVEPOINT lightning_tick_item",
			"RELEASE SAVEPOINT lightning_tick_item",
		]);
	});

	it("rolls back to the savepoint and rethrows when the item fails", async () => {
		const manager = recordingManager();

		await expect(
			new LightningUnitOfWork().savepoint(manager, async () => {
				throw new Error("redis down");
			}),
		).rejects.toThrow("redis down");

		expect(manager.query.mock.calls.map(([sql]) => sql)).toEqual([
			"SAVEPOINT lightning_tick_item",
			"ROLLBACK TO SAVEPOINT lightning_tick_item",
			"RELEASE SAVEPOINT lightning_tick_item",
		]);
	});
});
