import { describe, expect, it, mock } from "bun:test";

import { CommunityDecksWorker } from "../../../../../src/modules/community-decks/infrastructure/CommunityDecksWorker";

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock(() => undefined),
	};
}

describe("CommunityDecksWorker", () => {
	it("logs a completed sync and stays quiet when no sync was due", async () => {
		const log = logger();
		const synced = { run: async () => ({ status: "synced" as const, categories: [] }) };
		await new CommunityDecksWorker(synced, 1000, log).runOnce();
		expect(log.info).toHaveBeenCalledTimes(1);

		const quiet = logger();
		const fresh = { run: async () => ({ status: "fresh" as const, categories: [] }) };
		await new CommunityDecksWorker(fresh, 1000, quiet).runOnce();
		expect(quiet.info).not.toHaveBeenCalled();
	});

	it("logs a failing sync instead of throwing", async () => {
		const log = logger();
		const failing = {
			run: async () => {
				throw new Error("db down");
			},
		};

		await new CommunityDecksWorker(failing, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});
});
