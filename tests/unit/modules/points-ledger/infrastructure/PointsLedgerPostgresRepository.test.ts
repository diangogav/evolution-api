import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { PointsLedgerEntry } from "../../../../../src/modules/points-ledger/domain/PointsLedgerEntry";
import { PointsLedgerPostgresRepository } from "../../../../../src/modules/points-ledger/infrastructure/PointsLedgerPostgresRepository";

function ledgerEntry(overrides: Partial<PointsLedgerEntry> = {}): PointsLedgerEntry {
	return {
		gameId: "game-1",
		userId: "user-1",
		rankId: "rank-global",
		season: 5,
		kind: "applied",
		cycle: 0,
		pointsDelta: 15,
		winsDelta: 1,
		lossesDelta: 0,
		...overrides,
	};
}

describe("PointsLedgerPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;
	let repository: PointsLedgerPostgresRepository;

	beforeEach(() => {
		querySpy = spyOn(dataSource, "query").mockResolvedValue([]);
		repository = new PointsLedgerPostgresRepository();
	});

	afterEach(() => {
		mock.restore();
	});

	it("insertEntry reports inserted or skipped based on the target-less ON CONFLICT DO NOTHING result", async () => {
		querySpy.mockResolvedValueOnce([{ id: "ledger-row-1" }]);
		expect(await repository.insertEntry(ledgerEntry())).toBe("inserted");
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("ON CONFLICT DO NOTHING");
		expect(sql).not.toContain("ON CONFLICT (");
		expect(params).toEqual(["game-1", "user-1", "rank-global", 5, "applied", 0, 15, 1, 0]);

		querySpy.mockResolvedValueOnce([]);
		expect(await repository.insertEntry(ledgerEntry())).toBe("skipped");
	});

	it("findEntriesForKey and findAppliedEntries pass the right parameters to their read queries", async () => {
		querySpy.mockResolvedValueOnce([ledgerEntry()]);
		const entries = await repository.findEntriesForKey("user-1", "rank-global", 5);
		expect(entries).toEqual([ledgerEntry()]);
		const [keySql, keyParams] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(keySql).toContain("ORDER BY created_at ASC, id ASC");
		expect(keyParams).toEqual(["user-1", "rank-global", 5]);

		querySpy.mockResolvedValueOnce([ledgerEntry({ kind: "applied" })]);
		const applied = await repository.findAppliedEntries("game-1");
		expect(applied).toEqual([ledgerEntry({ kind: "applied" })]);
		const [appliedSql, appliedParams] = querySpy.mock.calls[1] as [string, unknown[]];
		expect(appliedSql).toContain("kind = 'applied'");
		expect(appliedParams).toEqual(["game-1"]);
	});

	it("countByKind and findAchievementPoints pass the right parameters and default to zero", async () => {
		querySpy.mockResolvedValueOnce([{ count: 2 }]);
		expect(await repository.countByKind("game-1", "user-1", "rank-global", "reversal")).toBe(2);
		const [countSql, countParams] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(countSql).toContain("count(*)");
		expect(countParams).toEqual(["game-1", "user-1", "rank-global", "reversal"]);
		querySpy.mockResolvedValueOnce([]);
		expect(await repository.countByKind("game-1", "user-1", "rank-global", "reinstatement")).toBe(
			0,
		);

		querySpy.mockResolvedValueOnce([{ points: 40 }]);
		const points = await repository.findAchievementPoints("user-1", "Master Duel", 5);
		expect(points).toBe(40);
		const [achSql, achParams] = querySpy.mock.calls[2] as [string, unknown[]];
		expect(achSql).toContain("json_array_elements_text(ua.labels)");
		expect(achParams).toEqual(["user-1", 5, "Master Duel"]);
		querySpy.mockResolvedValueOnce([]);
		expect(await repository.findAchievementPoints("user-1", "Master Duel", 5)).toBe(0);
	});

	it("reprojectPlayerStats opens its own transaction without a manager, and composes into one when given", async () => {
		const manager = { query: mock() };
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([ledgerEntry({ pointsDelta: 15, winsDelta: 1, lossesDelta: 0 })]) // entries
			.mockResolvedValueOnce(undefined); // player_stats upsert
		const transactionSpy = spyOn(dataSource, "transaction").mockImplementation((async (
			work: (manager: unknown) => Promise<unknown>,
		) => work(manager)) as never);
		await repository.reprojectPlayerStats("user-1", "rank-global", 5, 10);

		expect(transactionSpy).toHaveBeenCalledTimes(1);
		const [lockSql, lockParams] = manager.query.mock.calls[0] as [string, unknown[]];
		expect(lockSql).toContain("pg_advisory_xact_lock");
		expect(lockSql).not.toContain("'|'");
		expect(lockSql).toContain("length($2)::text");
		expect(lockParams).toEqual(["user-1", "rank-global", 5]);
		const [upsertSql, upsertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		expect(upsertSql).toContain("player_stats");
		expect(upsertParams).toEqual(["user-1", "rank-global", 5, 1, 0, 25]);
		const suppliedManager = { query: mock() };
		suppliedManager.query
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce([ledgerEntry({ pointsDelta: 15, winsDelta: 1, lossesDelta: 0 })])
			.mockResolvedValueOnce(undefined);
		transactionSpy.mockClear();
		await repository.reprojectPlayerStats("user-1", "rank-global", 5, 0, suppliedManager);

		expect(transactionSpy).not.toHaveBeenCalled();
		expect(suppliedManager.query).toHaveBeenCalledTimes(3);
	});
});
