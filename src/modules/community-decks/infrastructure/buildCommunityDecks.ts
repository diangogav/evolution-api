import { config } from "../../../config";
import type { Logger } from "../../../shared/logger/domain/Logger";
import { SyncCommunityDecks } from "../application/SyncCommunityDecks";
import { CommunityDeckPostgresRepository } from "./CommunityDeckPostgresRepository";
import { CommunityDecksWorker } from "./CommunityDecksWorker";
import { HttpCardAlternatesSource } from "./HttpCardAlternatesSource";
import { HttpFormatListSource } from "./HttpFormatListSource";
import { getJson, getText } from "./httpGet";
import { PostgresSyncLock } from "./PostgresSyncLock";
import { YgoProDeckClient } from "./YgoProDeckClient";

const MAX_CHECK_PERIOD_MS = 3_600_000;

export function buildCommunityDecksWorker(logger: Logger): CommunityDecksWorker {
	const settings = config.communityDecksWorker;
	const sync = new SyncCommunityDecks({
		source: new YgoProDeckClient({
			getJson,
			sleep: (ms) => Bun.sleep(ms),
			now: () => new Date(),
			maxPages: settings.maxPages,
		}),
		formatLists: new HttpFormatListSource(getText),
		alternates: new HttpCardAlternatesSource(getJson),
		repository: new CommunityDeckPostgresRepository(),
		lock: new PostgresSyncLock(),
		logger,
		edisonMinViews: settings.edisonMinViews,
		intervalMs: settings.intervalMs,
	});
	// Checking hourly (or more often for short intervals) keeps syncs close to the interval
	// without one starting on every restart.
	return new CommunityDecksWorker(sync, Math.min(settings.intervalMs, MAX_CHECK_PERIOD_MS), logger);
}
