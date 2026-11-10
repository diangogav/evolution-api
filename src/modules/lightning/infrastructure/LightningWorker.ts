import { Logger } from "../../../shared/logger/domain/Logger";
import { ProcessLightningTick } from "../application/ProcessLightningTick";

// Drives ProcessLightningTick on a fixed interval; ticks never overlap within a process and
// a failing tick is logged and retried on the next interval.
export class LightningWorker {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	constructor(
		private readonly tick: Pick<ProcessLightningTick, "run">,
		private readonly intervalMs: number,
		private readonly logger: Logger,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.logger.info(`Lightning worker started (every ${this.intervalMs} ms)`);
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
			if (result.stale > 0) {
				this.logger.error(
					`Lightning worker voided ${result.stale} game(s) the duel server never closed`,
				);
			}
			const changes =
				result.transitions +
				result.applied +
				result.paired +
				result.completed +
				result.removed +
				result.failed;
			if (changes > 0) this.logger.info(`Lightning worker processed ${JSON.stringify(result)}`);
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
