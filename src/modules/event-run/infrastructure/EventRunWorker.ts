import { Logger } from "../../../shared/logger/domain/Logger";
import { ProcessEventRunTick } from "../application/ProcessEventRunTick";

// Drives ProcessEventRunTick on a fixed interval; ticks never overlap within a process and
// a failing tick is logged and retried on the next interval.
export class EventRunWorker {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	constructor(
		private readonly tick: Pick<ProcessEventRunTick, "run">,
		private readonly intervalMs: number,
		private readonly logger: Logger,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.logger.info(`Event run worker started (every ${this.intervalMs} ms)`);
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
					`Event run worker voided ${result.stale} reserved duel(s) the duel server never closed`,
				);
			}
			if (result.applied + result.ignored + result.failed + result.expired > 0) {
				this.logger.info(`Event run worker processed ${JSON.stringify(result)}`);
			}
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
