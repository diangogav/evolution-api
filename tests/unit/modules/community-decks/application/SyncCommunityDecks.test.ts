import { describe, expect, it, mock } from "bun:test";

import { SyncCommunityDecks } from "../../../../../src/modules/community-decks/application/SyncCommunityDecks";
import type { CommunityDeck } from "../../../../../src/modules/community-decks/domain/CommunityDeck";
import type { FormatListId } from "../../../../../src/modules/community-decks/domain/CommunityDeckCategory";
import type { CommunityDeckRepository } from "../../../../../src/modules/community-decks/domain/CommunityDeckRepository";
import type { SourceDeck } from "../../../../../src/modules/community-decks/domain/SourceDeck";
import { alternates, blacklist, edisonList, filler, sourceDeck } from "../domain/fixtures";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const DAY = 86_400_000;

// In-memory stand-in with the repository's contract: rows keyed by (source, source id).
class FakeRepository implements CommunityDeckRepository {
	rows = new Map<string, CommunityDeck & { syncedAt: Date }>();
	replaced: string[] = [];

	async replaceCategory(
		_source: "ygoprodeck",
		category: string,
		decks: CommunityDeck[],
		syncedAt: Date,
	) {
		this.replaced.push(category);
		let removed = 0;
		const keep = new Set(decks.map((deck) => deck.sourceId));
		for (const [key, row] of this.rows) {
			if (row.category === category && !keep.has(row.sourceId)) {
				this.rows.delete(key);
				removed++;
			}
		}
		for (const deck of decks) this.rows.set(deck.sourceId, { ...deck, syncedAt });
		return { removed };
	}

	async lastSyncedAt() {
		const times = [...this.rows.values()].map((row) => row.syncedAt.getTime());
		return times.length ? new Date(Math.max(...times)) : null;
	}

	async search() {
		return { items: [], total: 0 };
	}

	async formats() {
		return [];
	}
}

const LISTS: Record<FormatListId, ReturnType<typeof edisonList>> = {
	tcg: blacklist([]),
	genesys: blacklist([], "Genesys"),
	edison: edisonList(),
};

function setup(
	decks: Partial<Record<string, SourceDeck[] | Error>>,
	options: { repository?: FakeRepository; locked?: boolean; alternatesFail?: boolean } = {},
) {
	const repository = options.repository ?? new FakeRepository();
	const logger = {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock(() => undefined),
	};
	const fetched: string[] = [];
	const sync = new SyncCommunityDecks({
		source: {
			fetchCategory: async (category) => {
				fetched.push(category);
				const result = decks[category] ?? [];
				if (result instanceof Error) throw result;
				return result;
			},
		},
		formatLists: { fetch: async (id) => LISTS[id] },
		alternates: {
			fetch: async () => {
				if (options.alternatesFail) throw new Error("404");
				return alternates;
			},
		},
		repository,
		lock: {
			runExclusive: async <T>(work: () => Promise<T>) => (options.locked ? undefined : work()),
		},
		logger,
		edisonMinViews: 100,
		intervalMs: DAY,
	});
	return { sync, repository, logger, fetched };
}

const legal = (sourceId: string, overrides: Partial<SourceDeck> = {}) =>
	sourceDeck({ sourceId, main: filler(40, Number(sourceId) * 100), ...overrides });

// Edison only allows the fillers fixtures list; other categories use an empty blacklist.
const edison = (sourceId: string, overrides: Partial<SourceDeck> = {}) =>
	sourceDeck({ sourceId, ...overrides });

describe("SyncCommunityDecks", () => {
	it("stores the legal decks of every category with the label of its list", async () => {
		const { sync, repository } = setup({
			"Tournament Meta Decks": [legal("1")],
			"Tournament Meta Decks (Genesys)": [legal("2")],
			"Edison Format Decks": [edison("3")],
		});

		const result = await sync.run(NOW);

		expect(result.status).toBe("synced");
		expect([...repository.rows.values()].map((row) => [row.sourceId, row.format])).toEqual([
			["1", "2026.9 TCG"],
			["2", "Genesys"],
			["3", "2010.3 Edison"],
		]);
	});

	it("never stores illegal or low-view Edison decks and counts them as rejected", async () => {
		const { sync, repository } = setup({
			"Tournament Meta Decks": [legal("1")],
			"Edison Format Decks": [
				edison("3", { main: filler(39) }),
				edison("4", { views: 5 }),
				edison("5"),
			],
		});

		const result = await sync.run(NOW);

		expect([...repository.rows.keys()].sort()).toEqual(["1", "5"]);
		expect(result.categories.find((entry) => entry.category === "Edison Format Decks")).toEqual({
			category: "Edison Format Decks",
			status: "synced",
			fetched: 3,
			stored: 1,
			rejected: 2,
			duplicates: 0,
			removed: 0,
		});
	});

	it("stores one copy of duplicate lists, the most viewed", async () => {
		const { sync, repository } = setup({
			"Edison Format Decks": [
				edison("3", { views: 200 }),
				edison("4", { views: 900, main: [...filler(40)].reverse() }),
			],
		});

		await sync.run(NOW);

		expect([...repository.rows.keys()]).toEqual(["4"]);
	});

	it("removes decks gone upstream after a complete sync of their category", async () => {
		const repository = new FakeRepository();
		await setup({ "Tournament Meta Decks": [legal("1"), legal("2")] }, { repository }).sync.run(
			NOW,
		);

		const later = new Date(NOW.getTime() + DAY);
		const result = await setup({ "Tournament Meta Decks": [legal("2")] }, { repository }).sync.run(
			later,
		);

		expect([...repository.rows.keys()]).toEqual(["2"]);
		expect(result.categories[0]).toMatchObject({ removed: 1 });
	});

	it("keeps a category's rows when its fetch fails, and syncs the others", async () => {
		const repository = new FakeRepository();
		await setup(
			{ "Tournament Meta Decks": [legal("1")], "Edison Format Decks": [edison("3")] },
			{ repository },
		).sync.run(NOW);

		repository.replaced = [];
		const later = new Date(NOW.getTime() + DAY);
		const { sync, logger } = setup(
			{ "Tournament Meta Decks": new Error("HTTP 503"), "Edison Format Decks": [edison("4")] },
			{ repository },
		);
		const result = await sync.run(later);

		expect(repository.rows.has("1")).toBe(true);
		expect(result.categories[0]).toMatchObject({
			category: "Tournament Meta Decks",
			status: "failed",
		});
		expect(logger.error).toHaveBeenCalled();
		expect(repository.replaced).toEqual(["Edison Format Decks"]);
		expect(repository.rows.has("4")).toBe(true);
	});

	it("treats an empty category as failed instead of wiping it", async () => {
		const repository = new FakeRepository();
		await setup({ "Edison Format Decks": [edison("3")] }, { repository }).sync.run(NOW);
		repository.replaced = [];

		await setup({ "Edison Format Decks": [] }, { repository }).sync.run(
			new Date(NOW.getTime() + DAY),
		);

		expect(repository.rows.has("3")).toBe(true);
		expect(repository.replaced).toEqual([]);
	});

	it("touches nothing when the alternates map cannot be read", async () => {
		const { sync, repository, fetched } = setup(
			{ "Tournament Meta Decks": [legal("1")] },
			{ alternatesFail: true },
		);

		const result = await sync.run(NOW);

		expect(result.status).toBe("failed");
		expect(fetched).toEqual([]);
		expect(repository.replaced).toEqual([]);
	});

	it("skips while another instance holds the lock", async () => {
		const { sync, fetched } = setup({ "Tournament Meta Decks": [legal("1")] }, { locked: true });

		expect((await sync.run(NOW)).status).toBe("locked");
		expect(fetched).toEqual([]);
	});

	it("skips until the interval has passed since the last sync", async () => {
		const repository = new FakeRepository();
		await setup({ "Tournament Meta Decks": [legal("1")] }, { repository }).sync.run(NOW);

		const early = setup({ "Tournament Meta Decks": [legal("1")] }, { repository });
		expect((await early.sync.run(new Date(NOW.getTime() + DAY - 1))).status).toBe("fresh");
		expect(early.fetched).toEqual([]);

		const due = setup({ "Tournament Meta Decks": [legal("1")] }, { repository });
		expect((await due.sync.run(new Date(NOW.getTime() + DAY))).status).toBe("synced");
	});
});
