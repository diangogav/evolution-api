import { describe, expect, it, mock } from "bun:test";

import { PostgresSyncLock } from "../../../../../src/modules/community-decks/infrastructure/PostgresSyncLock";

function dataSource(locked: boolean) {
	const runner = {
		connect: mock(async () => undefined),
		release: mock(async () => undefined),
		query: mock(async (sql: string) => (sql.includes("pg_try_advisory_lock") ? [{ locked }] : [])),
	};
	return { runner, source: { createQueryRunner: () => runner } };
}

describe("PostgresSyncLock", () => {
	it("runs the work holding the session lock and always unlocks and releases", async () => {
		const { runner, source } = dataSource(true);
		const lock = new PostgresSyncLock(source as never);

		await expect(
			lock.runExclusive(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(runner.query.mock.calls.map(([sql]) => sql.split("(")[0])).toEqual([
			"SELECT pg_try_advisory_lock",
			"SELECT pg_advisory_unlock",
		]);
		expect(runner.release).toHaveBeenCalledTimes(1);
	});

	it("skips the work when another instance holds the lock", async () => {
		const { runner, source } = dataSource(false);
		const work = mock(async () => 1);

		expect(await new PostgresSyncLock(source as never).runExclusive(work)).toBeUndefined();
		expect(work).not.toHaveBeenCalled();
		expect(runner.release).toHaveBeenCalledTimes(1);
	});
});
