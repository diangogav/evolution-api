import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { QueryableManager } from "../domain/EssenceLedgerRepository";
import { InsertClaimResult, MissionClaimRepository } from "../domain/MissionClaimRepository";

const FIND_CLAIMED_QUERY = `SELECT mission_id AS "missionId" FROM mission_claims
	WHERE user_id = $1 AND mission_id = ANY($2::uuid[]) AND period_key = $3`;

// Target-less ON CONFLICT DO NOTHING: the (user_id, mission_id, period_key) primary
// key decides, so a racing duplicate is skipped instead of raising.
const INSERT_QUERY = `INSERT INTO mission_claims (user_id, mission_id, period_key)
	VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING user_id`;

// Transaction-scoped, released with commit or rollback. Keyed by user and period so
// unrelated users never wait on each other.
const LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended('mission-claim:' || $1 || ':' || $2, 0))`;

const COUNT_QUERY = `SELECT count(*)::int AS count FROM mission_claims
	WHERE user_id = $1 AND mission_id = ANY($2::uuid[]) AND period_key = $3`;

export class MissionClaimPostgresRepository implements MissionClaimRepository {
	async lockUserPeriod(
		userId: string,
		periodKey: string,
		manager: QueryableManager,
	): Promise<void> {
		await manager.query(LOCK_QUERY, [userId, periodKey]);
	}

	async findClaimedMissionIds(
		userId: string,
		missionIds: string[],
		periodKey: string,
		manager?: QueryableManager,
	): Promise<string[]> {
		if (missionIds.length === 0) return [];
		const rows = await this.query<{ missionId: string }>(
			FIND_CLAIMED_QUERY,
			[userId, missionIds, periodKey],
			manager,
		);
		return rows.map((row) => row.missionId);
	}

	async insert(
		userId: string,
		missionId: string,
		periodKey: string,
		manager?: QueryableManager,
	): Promise<InsertClaimResult> {
		const rows = await this.query(INSERT_QUERY, [userId, missionId, periodKey], manager);
		return rows.length > 0 ? "inserted" : "skipped";
	}

	async countClaims(
		userId: string,
		missionIds: string[],
		periodKey: string,
		manager?: QueryableManager,
	): Promise<number> {
		if (missionIds.length === 0) return 0;
		const rows = await this.query<{ count: number }>(
			COUNT_QUERY,
			[userId, missionIds, periodKey],
			manager,
		);
		return rows[0]?.count ?? 0;
	}

	private async query<T>(
		sql: string,
		parameters: unknown[],
		manager?: QueryableManager,
	): Promise<T[]> {
		const runner = manager ?? cosmeticsDataSource;
		return (await runner.query(sql, parameters)) as T[];
	}
}
