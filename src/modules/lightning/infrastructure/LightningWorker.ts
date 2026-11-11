import { Logger } from "../../../shared/logger/domain/Logger";
import { ProcessLightningTick } from "../application/ProcessLightningTick";
import { LightningSummons, LightningSummonsNotifier } from "../domain/LightningSummons";

// Drives ProcessLightningTick on a fixed interval; ticks never overlap within a process and
// a failing tick is logged and retried on the next interval. The tick resolves only after
// its transaction committed, so the summons it returns are pairings that stand; they are
// handed to the notifier without waiting, and a notifier failure is only logged.
export class LightningWorker {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	constructor(
		private readonly tick: Pick<ProcessLightningTick, "run">,
		private readonly intervalMs: number,
		private readonly logger: Logger,
		private readonly notifier: LightningSummonsNotifier | null = null,
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
			const { summons, ...result } = await this.tick.run(now);
			this.notify(summons, now);
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

	private notify(summons: readonly LightningSummons[], now: Date): void {
		if (!this.notifier || summons.length === 0) return;
		try {
			this.notifier.notify(summons, now).catch((error) => this.logNotifyFailure(error));
		} catch (error) {
			this.logNotifyFailure(error);
		}
	}

	private logNotifyFailure(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.logger.error(`Lightning worker could not notify summons: ${message}`);
	}

	private schedule(delayMs: number): void {
		if (!this.running) return;
		this.timer = setTimeout(async () => {
			await this.runOnce();
			this.schedule(this.intervalMs);
		}, delayMs);
	}
}
