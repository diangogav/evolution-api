import type {
	ActiveSession,
	RefreshTokenRecord,
	RefreshTokenRepository,
	StoredRefreshToken,
} from "../../../../src/modules/auth/domain/RefreshToken";

type Row = StoredRefreshToken & { usedAt: Date | null; revokedAt: Date | null };

/** The refresh token table held in memory, with the same rules as the SQL statements. */
export class InMemoryRefreshTokens implements RefreshTokenRepository {
	readonly rows: Row[] = [];

	async save(token: StoredRefreshToken): Promise<void> {
		this.rows.push({ ...token, usedAt: null, revokedAt: null });
	}

	async consume(tokenHash: string, now: Date): Promise<RefreshTokenRecord | null> {
		const row = this.rows.find((candidate) => candidate.tokenHash === tokenHash);
		if (!row || row.usedAt || row.revokedAt || row.expiresAt <= now) return null;
		row.usedAt = now;
		return this.record(row);
	}

	async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
		const row = this.rows.find((candidate) => candidate.tokenHash === tokenHash);
		return row ? this.record(row) : null;
	}

	async revokeFamily(familyId: string, now: Date): Promise<void> {
		for (const row of this.rows) {
			if (row.familyId === familyId && !row.revokedAt) row.revokedAt = now;
		}
	}

	async revokeAllForUser(userId: string, now: Date): Promise<string[]> {
		return this.revokeWhere((row) => row.userId === userId, now);
	}

	async revokeAllForUserExcept(userId: string, keepFamilyId: string, now: Date): Promise<string[]> {
		return this.revokeWhere((row) => row.userId === userId && row.familyId !== keepFamilyId, now);
	}

	private revokeWhere(matches: (row: Row) => boolean, now: Date): string[] {
		const families = new Set<string>();
		for (const row of this.rows) {
			if (!matches(row) || row.revokedAt) continue;
			row.revokedAt = now;
			families.add(row.familyId);
		}
		return [...families];
	}

	async listActiveForUser(userId: string, now: Date): Promise<ActiveSession[]> {
		const newest = new Map<string, Row>();
		for (const row of this.rows) {
			if (row.userId !== userId || row.usedAt || row.revokedAt || row.expiresAt <= now) continue;
			const seen = newest.get(row.familyId);
			if (!seen || seen.createdAt < row.createdAt) newest.set(row.familyId, row);
		}
		return [...newest.values()].map((row) => ({
			familyId: row.familyId,
			userAgent: row.userAgent,
			signedInAt: row.signedInAt,
			lastUsedAt: row.createdAt,
		}));
	}

	async deleteExpired(userId: string, now: Date): Promise<void> {
		for (let index = this.rows.length - 1; index >= 0; index--) {
			const row = this.rows[index];
			if (row.userId === userId && row.expiresAt <= now) this.rows.splice(index, 1);
		}
	}

	private record(row: Row): RefreshTokenRecord {
		return {
			userId: row.userId,
			familyId: row.familyId,
			mustUpgrade: row.mustUpgrade,
			usedAt: row.usedAt,
			revokedAt: row.revokedAt,
			expiresAt: row.expiresAt,
			userAgent: row.userAgent,
			signedInAt: row.signedInAt,
		};
	}
}
