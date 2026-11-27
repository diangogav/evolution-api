import { runQuery } from "../../../shared/persistence/runQuery";
import { StoredUserDeck, UserDeck } from "../domain/UserDeck";
import { UserDeckRepository } from "../domain/UserDeckRepository";

const COLUMNS = `"id", "name", "format", "main", "extra", "side", "created_at", "updated_at", "deleted_at", "revision"`;

// When a deck last changed: its last edit, or its deletion if later.
const LAST_CHANGE = `GREATEST("user_decks"."updated_at", COALESCE("user_decks"."deleted_at", '-infinity'::timestamptz))`;

const FIND = `SELECT ${COLUMNS} FROM "user_decks" WHERE "user_id" = $1 AND "id" = $2`;

// One statement decides the winner, so two devices saving at once cannot both overwrite.
const SAVE_IF_NEWER = `INSERT INTO "user_decks"
("user_id", "id", "name", "format", "main", "extra", "side", "created_at", "updated_at")
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT ("user_id", "id") DO UPDATE SET
"name" = EXCLUDED."name", "format" = EXCLUDED."format", "main" = EXCLUDED."main",
"extra" = EXCLUDED."extra", "side" = EXCLUDED."side", "updated_at" = EXCLUDED."updated_at",
"deleted_at" = NULL, "revision" = nextval('user_decks_revision_seq')
WHERE ${LAST_CHANGE} < EXCLUDED."updated_at"
RETURNING ${COLUMNS}`;

// A tombstone keeps only the identity and the time: the contents are not needed anymore.
const DELETE_IF_NEWER = `INSERT INTO "user_decks"
("user_id", "id", "name", "format", "main", "extra", "side", "created_at", "updated_at", "deleted_at")
VALUES ($1, $2, '', NULL, '{}', '{}', '{}', $3, $3, $3)
ON CONFLICT ("user_id", "id") DO UPDATE SET
"name" = '', "format" = NULL, "main" = '{}', "extra" = '{}', "side" = '{}',
"deleted_at" = EXCLUDED."deleted_at", "revision" = nextval('user_decks_revision_seq')
WHERE ${LAST_CHANGE} < EXCLUDED."deleted_at"`;

const COUNT_LIVE = `SELECT count(*)::int AS "live" FROM "user_decks" WHERE "user_id" = $1 AND "deleted_at" IS NULL`;

const LIST_CHANGED_SINCE = `SELECT ${COLUMNS} FROM "user_decks"
WHERE "user_id" = $1 AND "revision" > $2::bigint ORDER BY "revision"`;

type Row = {
	id: string;
	name: string;
	format: string | null;
	main: number[];
	extra: number[];
	side: number[];
	created_at: Date;
	updated_at: Date;
	deleted_at: Date | null;
	revision: string;
};

function toDeck(row: Row): StoredUserDeck {
	return {
		id: row.id,
		name: row.name,
		format: row.format,
		main: row.main,
		extra: row.extra,
		side: row.side,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		deletedAt: row.deleted_at,
		revision: String(row.revision),
	};
}

// Through TypeORM, pg answers an UPDATE ... RETURNING as [rows, count] and an INSERT as rows.
function rowsOf(result: (Row | Row[])[]): Row[] {
	return (Array.isArray(result[0]) ? result[0] : result) as Row[];
}

export class UserDeckPostgresRepository implements UserDeckRepository {
	async find(userId: string, id: string): Promise<StoredUserDeck | null> {
		const rows = await runQuery<Row>(FIND, [userId, id]);
		return rows[0] ? toDeck(rows[0]) : null;
	}

	async saveIfNewer(userId: string, deck: UserDeck): Promise<StoredUserDeck | null> {
		const result = await runQuery<Row | Row[]>(SAVE_IF_NEWER, [
			userId,
			deck.id,
			deck.name,
			deck.format,
			deck.main,
			deck.extra,
			deck.side,
			deck.createdAt,
			deck.updatedAt,
		]);
		const [row] = rowsOf(result);
		return row ? toDeck(row) : null;
	}

	async deleteIfNewer(userId: string, id: string, deletedAt: Date): Promise<void> {
		await runQuery(DELETE_IF_NEWER, [userId, id, deletedAt]);
	}

	async countLive(userId: string): Promise<number> {
		const [row] = await runQuery<{ live: number }>(COUNT_LIVE, [userId]);
		return row?.live ?? 0;
	}

	async listChangedSince(userId: string, revision: string): Promise<StoredUserDeck[]> {
		return (await runQuery<Row>(LIST_CHANGED_SINCE, [userId, revision])).map(toDeck);
	}
}
