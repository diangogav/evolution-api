import { Logger } from "../../../shared/logger/domain/Logger";
import { ProcessRewardsTick } from "../application/ProcessRewardsTick";

// Drives ProcessRewardsTick on a fixed interval. Ticks never overlap within one process;
// across processes the unit of work's lock decides. A failing tick is logged and retried
// on the next interval: the cursor only moves inside a committed transaction.
export class RewardsWorker {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	constructor(
		private readonly tick: ProcessRewardsTick,
		private readonly intervalMs: number,
		private readonly logger: Logger,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.logger.info(`Rewards worker started (every ${this.intervalMs} ms)`);
		this.schedule(0);
	}

	stop(): void {
		this.running = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	async runOnce(now: Date = new Date()): Promise<void> {
		try {
			const result = await this.tick.run(now);
			const total = Object.values(result.processed).reduce((sum, n) => sum + n, 0);
			if (total > 0)
				this.logger.info(`Rewards worker processed ${JSON.stringify(result.processed)}`);
		} catch (error) {
			this.logger.error(error as Error);
		}
	}

	private schedule(delayMs: number): void {
		if (!this.running) return;
		this.timer = setTimeout(async () => {
			await this.runOnce();
			this.schedule(this.intervalMs);
		}, delayMs);
	}
}
