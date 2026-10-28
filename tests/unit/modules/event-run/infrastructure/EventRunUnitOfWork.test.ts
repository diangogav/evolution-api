import { describe, expect, it, mock } from "bun:test";

import { EventRunUnitOfWork } from "../../../../../src/modules/event-run/infrastructure/EventRunUnitOfWork";

function recordingManager() {
	return { query: mock(async (_sql: string) => []) };
}

describe("EventRunUnitOfWork.savepoint", () => {
	it("releases the savepoint after a successful item", async () => {
		const manager = recordingManager();

		expect(await new EventRunUnitOfWork().savepoint(manager, async () => "applied")).toBe(
			"applied",
		);

		expect(manager.query.mock.calls.map(([sql]) => sql)).toEqual([
			"SAVEPOINT event_run_tick_item",
			"RELEASE SAVEPOINT event_run_tick_item",
		]);
	});

	it("rolls back to the savepoint and rethrows when the item fails", async () => {
		const manager = recordingManager();

		await expect(
			new EventRunUnitOfWork().savepoint(manager, async () => {
				throw new Error("broken record");
			}),
		).rejects.toThrow("broken record");

		expect(manager.query.mock.calls.map(([sql]) => sql)).toEqual([
			"SAVEPOINT event_run_tick_item",
			"ROLLBACK TO SAVEPOINT event_run_tick_item",
			"RELEASE SAVEPOINT event_run_tick_item",
		]);
	});
});
