import { describe, expect, it, mock } from "bun:test";

import { EventRunWorker } from "../../../../../src/modules/event-run/infrastructure/EventRunWorker";

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock(() => undefined),
	};
}

const empty = { applied: 0, stale: 0, ignored: 0, failed: 0, expired: 0, skipped: false };

describe("EventRunWorker", () => {
	it("logs processed ticks and stays quiet on empty ones", async () => {
		const log = logger();
		const tick = { run: mock(async () => ({ ...empty, applied: 2 })) };
		await new EventRunWorker(tick, 1000, log).runOnce(new Date());
		expect(log.info).toHaveBeenCalledTimes(1);

		const quiet = logger();
		await new EventRunWorker({ run: async () => empty }, 1000, quiet).runOnce(new Date());
		expect(quiet.info).not.toHaveBeenCalled();
	});

	it("raises an alert when stale duels were voided", async () => {
		const log = logger();
		await new EventRunWorker({ run: async () => ({ ...empty, stale: 1 }) }, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});

	it("logs a failing tick instead of throwing", async () => {
		const log = logger();
		const failing = {
			run: async () => {
				throw new Error("db down");
			},
		};

		await new EventRunWorker(failing, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});
});
