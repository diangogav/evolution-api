import { describe, expect, it, mock } from "bun:test";

import { LightningWorker } from "../../../../../src/modules/lightning/infrastructure/LightningWorker";

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock(() => undefined),
	};
}

const empty = {
	tournaments: 2,
	transitions: 0,
	applied: 0,
	stale: 0,
	paired: 0,
	completed: 0,
	removed: 0,
	failed: 0,
	skipped: false,
};

describe("LightningWorker", () => {
	it("logs ticks that changed something and stays quiet on idle ones", async () => {
		const log = logger();
		await new LightningWorker({ run: async () => ({ ...empty, paired: 3 }) }, 1000, log).runOnce();
		expect(log.info).toHaveBeenCalledTimes(1);

		const quiet = logger();
		await new LightningWorker({ run: async () => empty }, 1000, quiet).runOnce();
		expect(quiet.info).not.toHaveBeenCalled();
	});

	it("raises an alert when stale games were voided", async () => {
		const log = logger();
		await new LightningWorker({ run: async () => ({ ...empty, stale: 1 }) }, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});

	it("logs a failing tick instead of throwing", async () => {
		const log = logger();
		const failing = {
			run: async () => {
				throw new Error("db down");
			},
		};

		await new LightningWorker(failing, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});
});
