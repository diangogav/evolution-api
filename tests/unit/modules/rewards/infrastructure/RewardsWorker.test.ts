import { describe, expect, it, mock } from "bun:test";

import { ProcessRewardsTick } from "../../../../../src/modules/rewards/application/ProcessRewardsTick";
import { RewardsWorker } from "../../../../../src/modules/rewards/infrastructure/RewardsWorker";

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock(() => undefined),
	};
}

describe("RewardsWorker", () => {
	it("runs a tick and logs only when something was processed", async () => {
		const tick = { run: mock(async () => ({ locked: true, processed: { matches: 2 } })) };
		const log = logger();

		await new RewardsWorker(tick as unknown as ProcessRewardsTick, 1000, log).runOnce(new Date());

		expect(tick.run).toHaveBeenCalledTimes(1);
		expect(log.info).toHaveBeenCalledTimes(1);
	});

	it("stays quiet on an empty tick", async () => {
		const tick = { run: mock(async () => ({ locked: true, processed: { matches: 0 } })) };
		const log = logger();

		await new RewardsWorker(tick as unknown as ProcessRewardsTick, 1000, log).runOnce(new Date());

		expect(log.info).not.toHaveBeenCalled();
	});

	it("logs a failing tick instead of throwing, so the loop survives", async () => {
		const tick = {
			run: mock(async () => {
				throw new Error("db down");
			}),
		};
		const log = logger();

		await new RewardsWorker(tick as unknown as ProcessRewardsTick, 1000, log).runOnce(new Date());

		expect(log.error).toHaveBeenCalledTimes(1);
	});

	it("start schedules an immediate tick and stop cancels the loop", async () => {
		const tick = { run: mock(async () => ({ locked: true, processed: {} })) };
		const worker = new RewardsWorker(tick as unknown as ProcessRewardsTick, 100_000, logger());

		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 20));
		worker.stop();

		expect(tick.run).toHaveBeenCalledTimes(1);
	});
});
