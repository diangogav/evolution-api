import type { Logger } from "../../../shared/logger/domain/Logger";
import type { SyncCommunityDecks } from "../application/SyncCommunityDecks";

// Checks on a fixed period whether a sync is due; the use case decides from the last stored
// sync, so restarts do not trigger extra syncs. A failing check is logged, never thrown.
export class CommunityDecksWorker {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	constructor(
		private readonly sync: Pick<SyncCommunityDecks, "run">,
		private readonly checkEveryMs: number,
		private readonly logger: Logger,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.logger.info(`Community decks worker started (checks every ${this.checkEveryMs} ms)`);
		this.schedule(0);
	}

	stop(): void {
		this.running = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	async runOnce(now: Date = new Date()): Promise<void> {
		try {
			const result = await this.sync.run(now);
			if (result.status === "synced") {
				this.logger.info(`Community decks synced ${JSON.stringify(result.categories)}`);
			}
		} catch (error) {
			this.logger.error(error as Error);
		}
	}

	private schedule(delayMs: number): void {
		if (!this.running) return;
		this.timer = setTimeout(async () => {
			await this.runOnce();
			this.schedule(this.checkEveryMs);
		}, delayMs);
	}
}
