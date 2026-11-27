import { runQuery } from "../../../shared/persistence/runQuery";
import {
	ActiveSession,
	RefreshTokenRecord,
	RefreshTokenRepository,
	StoredRefreshToken,
} from "../domain/RefreshToken";

const INSERT = `INSERT INTO "refresh_tokens"
("id", "user_id", "family_id", "token_hash", "must_upgrade", "created_at", "expires_at", "user_agent", "signed_in_at")
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

const RECORD_COLUMNS = `"user_id", "family_id", "must_upgrade", "used_at", "revoked_at", "expires_at", "user_agent", "signed_in_at"`;

// One statement decides the winner: a second request with the same token finds used_at set.
const CONSUME = `UPDATE "refresh_tokens" SET "used_at" = $2
WHERE "token_hash" = $1 AND "used_at" IS NULL AND "revoked_at" IS NULL AND "expires_at" > $2
RETURNING ${RECORD_COLUMNS}`;

const FIND_BY_HASH = `SELECT ${RECORD_COLUMNS} FROM "refresh_tokens" WHERE "token_hash" = $1`;

const REVOKE_FAMILY = `UPDATE "refresh_tokens" SET "revoked_at" = $2
WHERE "family_id" = $1 AND "revoked_at" IS NULL`;

const REVOKE_ALL_FOR_USER = `UPDATE "refresh_tokens" SET "revoked_at" = $2
WHERE "user_id" = $1 AND "revoked_at" IS NULL
RETURNING "family_id"`;

const REVOKE_ALL_FOR_USER_EXCEPT = `UPDATE "refresh_tokens" SET "revoked_at" = $2
WHERE "user_id" = $1 AND "family_id" <> $3 AND "revoked_at" IS NULL
RETURNING "family_id"`;

// The newest token of a live sign-in is the unused one renewal handed out last.
const LIST_ACTIVE_FOR_USER = `SELECT DISTINCT ON ("family_id") "family_id", "user_agent", "signed_in_at", "created_at"
FROM "refresh_tokens"
WHERE "user_id" = $1 AND "used_at" IS NULL AND "revoked_at" IS NULL AND "expires_at" > $2
ORDER BY "family_id", "created_at" DESC`;

const DELETE_EXPIRED = `DELETE FROM "refresh_tokens" WHERE "user_id" = $1 AND "expires_at" <= $2`;

type Row = {
	user_id: string;
	family_id: string;
	must_upgrade: boolean;
	used_at: Date | null;
	revoked_at: Date | null;
	expires_at: Date;
	user_agent: string | null;
	signed_in_at: Date;
};

type FamilyRow = { family_id: string };

// The pg driver answers an UPDATE ... RETURNING through TypeORM as [rows, count]; one id
// per sign-in, since a sign-in can have several tokens that were not revoked yet.
function familyIdsOf(result: (FamilyRow | FamilyRow[])[]): string[] {
	const rows = (Array.isArray(result[0]) ? result[0] : result) as FamilyRow[];
	return [...new Set(rows.map((row) => row.family_id))];
}

type ActiveRow = {
	family_id: string;
	user_agent: string | null;
	signed_in_at: Date;
	created_at: Date;
};

function toRecord(row: Row): RefreshTokenRecord {
	return {
		userId: row.user_id,
		familyId: row.family_id,
		mustUpgrade: row.must_upgrade,
		usedAt: row.used_at,
		revokedAt: row.revoked_at,
		expiresAt: row.expires_at,
		userAgent: row.user_agent,
		signedInAt: row.signed_in_at,
	};
}

export class RefreshTokenPostgresRepository implements RefreshTokenRepository {
	async save(token: StoredRefreshToken): Promise<void> {
		await runQuery(INSERT, [
			token.id,
			token.userId,
			token.familyId,
			token.tokenHash,
			token.mustUpgrade,
			token.createdAt,
			token.expiresAt,
			token.userAgent,
			token.signedInAt,
		]);
	}

	async consume(tokenHash: string, now: Date): Promise<RefreshTokenRecord | null> {
		const result = await runQuery<Row | Row[]>(CONSUME, [tokenHash, now]);
		// The pg driver answers an UPDATE ... RETURNING through TypeORM as [rows, count].
		const rows = (Array.isArray(result[0]) ? result[0] : result) as Row[];

		return rows[0] ? toRecord(rows[0]) : null;
	}

	async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
		const rows = await runQuery<Row>(FIND_BY_HASH, [tokenHash]);

		return rows[0] ? toRecord(rows[0]) : null;
	}

	async revokeFamily(familyId: string, now: Date): Promise<void> {
		await runQuery(REVOKE_FAMILY, [familyId, now]);
	}

	async revokeAllForUser(userId: string, now: Date): Promise<string[]> {
		return familyIdsOf(await runQuery<FamilyRow | FamilyRow[]>(REVOKE_ALL_FOR_USER, [userId, now]));
	}

	async revokeAllForUserExcept(userId: string, keepFamilyId: string, now: Date): Promise<string[]> {
		return familyIdsOf(
			await runQuery<FamilyRow | FamilyRow[]>(REVOKE_ALL_FOR_USER_EXCEPT, [
				userId,
				now,
				keepFamilyId,
			]),
		);
	}

	async listActiveForUser(userId: string, now: Date): Promise<ActiveSession[]> {
		const rows = await runQuery<ActiveRow>(LIST_ACTIVE_FOR_USER, [userId, now]);

		return rows.map((row) => ({
			familyId: row.family_id,
			userAgent: row.user_agent,
			signedInAt: row.signed_in_at,
			lastUsedAt: row.created_at,
		}));
	}

	async deleteExpired(userId: string, now: Date): Promise<void> {
		await runQuery(DELETE_EXPIRED, [userId, now]);
	}
}
