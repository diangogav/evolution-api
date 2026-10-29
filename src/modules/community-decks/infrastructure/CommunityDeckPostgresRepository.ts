import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import type { CommunityDeck, CommunityDeckSourceName } from "../domain/CommunityDeck";
import type {
	CommunityDeckFormatCount,
	CommunityDeckRepository,
	CommunityDeckSearch,
	CommunityDeckView,
} from "../domain/CommunityDeckRepository";

// YGOPRODeck only shows coarse relative dates, so a deck keeps the date first read for its
// current list and takes a new one only when the list itself changed.
export const UPSERT_DECK = `INSERT INTO "community_decks" ("source", "source_id", "category", "url", "author", "name", "format", "cover_card", "main", "extra", "side", "views", "content_hash", "source_updated_at", "synced_at")
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::integer[], $10::integer[], $11::integer[], $12, $13, $14, $15)
ON CONFLICT ("source", "source_id") DO UPDATE SET
"category" = EXCLUDED."category", "url" = EXCLUDED."url", "author" = EXCLUDED."author", "name" = EXCLUDED."name",
"format" = EXCLUDED."format", "cover_card" = EXCLUDED."cover_card", "main" = EXCLUDED."main", "extra" = EXCLUDED."extra",
"side" = EXCLUDED."side", "views" = EXCLUDED."views",
"source_updated_at" = CASE WHEN "community_decks"."content_hash" = EXCLUDED."content_hash"
THEN COALESCE("community_decks"."source_updated_at", EXCLUDED."source_updated_at") ELSE EXCLUDED."source_updated_at" END,
"content_hash" = EXCLUDED."content_hash", "synced_at" = EXCLUDED."synced_at"`;

// Counted through a CTE: TypeORM answers a bare DELETE with [rows, rowCount], not rows.
export const REMOVE_UNSEEN = `WITH "removed" AS (DELETE FROM "community_decks" WHERE "source" = $1 AND "category" = $2 AND NOT ("source_id" = ANY($3::varchar[])) RETURNING 1)
SELECT COUNT(*)::int AS "removed" FROM "removed"`;

const LAST_SYNCED = `SELECT MAX("synced_at") AS "last" FROM "community_decks" WHERE "source" = $1`;

// $1 format (null = any), $2 ILIKE pattern on name or author (null = any).
const FILTER = `WHERE ($1::varchar IS NULL OR "format" = $1) AND ($2::text IS NULL OR "name" ILIKE $2 OR "author" ILIKE $2)`;

export const SEARCH_DECKS = `SELECT "id", "name", "author", "format", "source", "url", "cover_card", "main", "extra", "side", "views", COALESCE("source_updated_at", "created_at") AS "updated_at"
FROM "community_decks" ${FILTER}
ORDER BY "views" DESC, "id" ASC LIMIT $3 OFFSET $4`;

export const COUNT_DECKS = `SELECT COUNT(*)::int AS "total" FROM "community_decks" ${FILTER}`;

const FORMATS = `SELECT "format", COUNT(*)::int AS "count" FROM "community_decks" GROUP BY "format" ORDER BY "count" DESC, "format" ASC`;

type DeckRow = {
	id: string;
	name: string;
	author: string;
	format: string;
	source: CommunityDeckSourceName;
	url: string;
	cover_card: number;
	main: number[];
	extra: number[];
	side: number[];
	views: number;
	updated_at: Date;
};

// `q` is matched literally: LIKE wildcards typed by a player are escaped.
export function containsPattern(q: string | undefined): string | null {
	if (!q) return null;
	return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export class CommunityDeckPostgresRepository implements CommunityDeckRepository {
	constructor(
		private readonly db: Pick<
			typeof cosmeticsDataSource,
			"query" | "transaction"
		> = cosmeticsDataSource,
	) {}

	async replaceCategory(
		source: CommunityDeckSourceName,
		category: string,
		decks: CommunityDeck[],
		syncedAt: Date,
	): Promise<{ removed: number }> {
		return this.db.transaction(async (txManager) => {
			const manager = txManager as unknown as QueryableManager;
			for (const deck of decks) {
				await manager.query(UPSERT_DECK, [
					source,
					deck.sourceId,
					category,
					deck.url,
					deck.author,
					deck.name,
					deck.format,
					deck.cover,
					deck.main,
					deck.extra,
					deck.side,
					deck.views,
					deck.contentHash,
					deck.sourceUpdatedAt,
					syncedAt,
				]);
			}
			const [row] = (await manager.query(REMOVE_UNSEEN, [
				source,
				category,
				decks.map((deck) => deck.sourceId),
			])) as Array<{ removed: number }>;
			return { removed: row?.removed ?? 0 };
		});
	}

	async lastSyncedAt(source: CommunityDeckSourceName): Promise<Date | null> {
		const [row] = (await this.db.query(LAST_SYNCED, [source])) as Array<{ last: Date | null }>;
		return row?.last ? new Date(row.last) : null;
	}

	async search(query: CommunityDeckSearch): Promise<{ items: CommunityDeckView[]; total: number }> {
		const filter = [query.format ?? null, containsPattern(query.q)];
		const offset = (query.page - 1) * query.pageSize;
		const [rows, counts] = await Promise.all([
			this.db.query(SEARCH_DECKS, [...filter, query.pageSize, offset]) as Promise<DeckRow[]>,
			this.db.query(COUNT_DECKS, filter) as Promise<Array<{ total: number }>>,
		]);
		return {
			items: rows.map((row) => ({
				id: row.id,
				name: row.name,
				author: row.author,
				format: row.format,
				source: row.source,
				sourceUrl: row.url,
				cover: row.cover_card,
				main: row.main,
				extra: row.extra,
				side: row.side,
				views: row.views,
				updatedAt: new Date(row.updated_at),
			})),
			total: counts[0]?.total ?? 0,
		};
	}

	async formats(): Promise<CommunityDeckFormatCount[]> {
		return (await this.db.query(FORMATS)) as CommunityDeckFormatCount[];
	}
}
