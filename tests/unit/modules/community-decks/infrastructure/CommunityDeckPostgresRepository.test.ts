import { describe, expect, it, mock } from "bun:test";

import type { CommunityDeck } from "../../../../../src/modules/community-decks/domain/CommunityDeck";
import {
	COUNT_DECKS,
	CommunityDeckPostgresRepository,
	REMOVE_UNSEEN,
	SEARCH_DECKS,
	UPSERT_DECK,
	containsPattern,
} from "../../../../../src/modules/community-decks/infrastructure/CommunityDeckPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

const deck = (sourceId: string): CommunityDeck => ({
	source: "ygoprodeck",
	sourceId,
	category: "Edison Format Decks",
	url: `https://ygoprodeck.com/deck/d-${sourceId}`,
	author: "Duelist",
	name: `Deck ${sourceId}`,
	format: "2010.3 Edison",
	cover: 1000,
	main: [1000, 1001],
	extra: [],
	side: [2000],
	views: 300,
	contentHash: "h".repeat(64),
	sourceUpdatedAt: null,
});

function database(results: Record<string, unknown[]> = {}) {
	const query = mock(async (sql: string, _params?: unknown[]) => results[sql] ?? []);
	const transaction = mock(async (work: (manager: unknown) => Promise<unknown>) => work({ query }));
	return { query, transaction };
}

describe("CommunityDeckPostgresRepository.replaceCategory", () => {
	it("upserts every deck then removes the category's unseen rows in one transaction", async () => {
		const db = database({ [REMOVE_UNSEEN]: [{ removed: 1 }] });
		const repository = new CommunityDeckPostgresRepository(db as never);
		const syncedAt = new Date("2026-10-29T12:00:00Z");

		const result = await repository.replaceCategory(
			"ygoprodeck",
			"Edison Format Decks",
			[deck("1"), deck("2")],
			syncedAt,
		);

		expect(result).toEqual({ removed: 1 });
		expect(db.transaction).toHaveBeenCalledTimes(1);
		const sqls = db.query.mock.calls.map(([sql]) => sql);
		expect(sqls).toEqual([UPSERT_DECK, UPSERT_DECK, REMOVE_UNSEEN]);
		expect(db.query.mock.calls[0][1]).toEqual([
			"ygoprodeck",
			"1",
			"Edison Format Decks",
			"https://ygoprodeck.com/deck/d-1",
			"Duelist",
			"Deck 1",
			"2010.3 Edison",
			1000,
			[1000, 1001],
			[],
			[2000],
			300,
			"h".repeat(64),
			null,
			syncedAt,
		]);
		expect(db.query.mock.calls[2][1]).toEqual(["ygoprodeck", "Edison Format Decks", ["1", "2"]]);
	});

	it("updates by (source, source id) and keeps the first date read for an unchanged list", () => {
		expect(compact(UPSERT_DECK)).toContain(`ON CONFLICT ("source", "source_id") DO UPDATE SET`);
		expect(compact(UPSERT_DECK)).toContain(
			`CASE WHEN "community_decks"."content_hash" = EXCLUDED."content_hash" THEN COALESCE("community_decks"."source_updated_at", EXCLUDED."source_updated_at") ELSE EXCLUDED."source_updated_at" END`,
		);
		expect(REMOVE_UNSEEN).toContain(`"source" = $1 AND "category" = $2`);
	});
});

describe("CommunityDeckPostgresRepository.search", () => {
	it("pages, filters and maps rows", async () => {
		const row = {
			id: "8d6f0c1e-2b8a-4d55-9e0b-1f3f6a7c2d10",
			name: "Deck 1",
			author: "Duelist",
			format: "2010.3 Edison",
			source: "ygoprodeck",
			url: "https://ygoprodeck.com/deck/d-1",
			cover_card: 1000,
			main: [1000],
			extra: [],
			side: [],
			views: 300,
			updated_at: new Date("2026-10-20T00:00:00Z"),
		};
		const db = database({ [SEARCH_DECKS]: [row], [COUNT_DECKS]: [{ total: 31 }] });
		const repository = new CommunityDeckPostgresRepository(db as never);

		const result = await repository.search({
			format: "2010.3 Edison",
			q: "50%_off",
			page: 3,
			pageSize: 12,
		});

		expect(result.total).toBe(31);
		expect(result.items[0]).toEqual({
			id: row.id,
			name: "Deck 1",
			author: "Duelist",
			format: "2010.3 Edison",
			source: "ygoprodeck",
			sourceUrl: "https://ygoprodeck.com/deck/d-1",
			cover: 1000,
			main: [1000],
			extra: [],
			side: [],
			views: 300,
			updatedAt: new Date("2026-10-20T00:00:00Z"),
		});
		const search = db.query.mock.calls.find(([sql]) => sql === SEARCH_DECKS);
		expect(search?.[1]).toEqual(["2010.3 Edison", "%50\\%\\_off%", 12, 24]);
		expect(compact(SEARCH_DECKS)).toContain(`"name" ILIKE $2 OR "author" ILIKE $2`);
	});

	it("passes null filters when none are given", async () => {
		const db = database({ [COUNT_DECKS]: [{ total: 0 }] });
		await new CommunityDeckPostgresRepository(db as never).search({ page: 1, pageSize: 24 });

		const count = db.query.mock.calls.find(([sql]) => sql === COUNT_DECKS);
		expect(count?.[1]).toEqual([null, null]);
		expect(containsPattern("")).toBeNull();
	});
});
