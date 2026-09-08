import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { MatchAnnulmentPostgresRepository } from "../../../../../src/modules/match-annulment/infrastructure/MatchAnnulmentPostgresRepository";
import { PointsLedgerEntry } from "../../../../../src/modules/points-ledger/domain/PointsLedgerEntry";
import { PointsLedgerRepository } from "../../../../../src/modules/points-ledger/domain/PointsLedgerRepository";

const REQUEST = {
	gameId: "game-1",
	reason: "cheating",
	offenderUserId: "user-1",
	adminUserId: "admin-1",
};

function row(overrides: Partial<PointsLedgerEntry> = {}): PointsLedgerEntry {
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

type Responses = {
	existence?: { rows: number; flagged: boolean }[];
	summaryKeys?: { day: string; banListName: string; season: number }[];
	reversedFlag?: { reversed: boolean }[];
	playerStats?: { wins: number; losses: number; points: number }[];
	reversalRows?: PointsLedgerEntry[];
};

function manager(responses: Responses, calls: string[]) {
	const query = mock(async (sql: string) => {
		calls.push(sql);
		if (sql.includes("count(*)::int AS rows"))
			return responses.existence ?? [{ rows: 2, flagged: false }];
		if (sql.includes("DISTINCT date_trunc")) {
			return (
				responses.summaryKeys ?? [{ day: "2026-09-01", banListName: "Master Duel", season: 5 }]
			);
		}
		if (sql.includes("kind = 'reversal') AS reversed"))
			return responses.reversedFlag ?? [{ reversed: false }];
		if (sql.startsWith("SELECT name FROM ranks")) return [{ name: "Master Duel" }];
		if (sql.startsWith("SELECT wins, losses, points")) return responses.playerStats ?? [];
		if (sql.startsWith("SELECT game_id AS")) {
			return (
				responses.reversalRows ?? [
					row({ kind: "reversal", pointsDelta: -15, winsDelta: -1, lossesDelta: 0 }),
				]
			);
		}
		return [];
	});
	return { query };
}

function ledgerFake(calls: string[]): PointsLedgerRepository {
	return {
		findAppliedEntries: mock(async () => {
			calls.push("findAppliedEntries");
			return [row()];
		}),
		findEntriesForKey: mock(async () => [row()]),
		insertEntry: mock(async () => {
			calls.push("insertEntry");
			return "inserted" as const;
		}),
		countByKind: mock(async () => 0),
		findAchievementPoints: mock(async () => 0),
		reprojectPlayerStats: mock(async () => {
			calls.push("reprojectPlayerStats");
		}),
	};
}

function setup(responses: Responses) {
	const calls: string[] = [];
	const mgr = manager(responses, calls);
	spyOn(dataSource, "transaction").mockImplementation((async (
		work: (manager: unknown) => Promise<unknown>,
	) => work(mgr)) as never);
	const ledger = ledgerFake(calls);
	return { repo: new MatchAnnulmentPostgresRepository(ledger), calls, ledger, mgr };
}

function gate(mgr: { query: ReturnType<typeof mock> }): [string, unknown[]] {
	return mgr.query.mock.calls.find(([sql]) => (sql as string).startsWith("UPDATE matches")) as [
		string,
		unknown[],
	];
}

describe("MatchAnnulmentPostgresRepository — annulPhaseOne", () => {
	afterEach(() => mock.restore());

	it("rejects before any write: no matches row, or an already-committed reversal", async () => {
		const notFound = setup({ existence: [{ rows: 0, flagged: false }] });
		expect(await notFound.repo.annulPhaseOne(REQUEST)).toEqual({ outcome: "not-found" });

		const already = setup({
			existence: [{ rows: 2, flagged: true }],
			reversedFlag: [{ reversed: true }],
		});
		expect(await already.repo.annulPhaseOne(REQUEST)).toEqual({ outcome: "already" });
		expect(already.calls.some((sql) => sql.startsWith("UPDATE matches"))).toBe(false);
		expect(already.ledger.insertEntry).not.toHaveBeenCalled();
	});

	it("corrects a pre-flagged game with no committed reversal instead of reporting already", async () => {
		const { repo, ledger } = setup({
			existence: [{ rows: 2, flagged: true }],
			reversedFlag: [{ reversed: false }],
			playerStats: [{ wins: 1, losses: 0, points: 15 }],
		});
		const result = await repo.annulPhaseOne(REQUEST);
		expect(result.outcome).toBe("annulled");
		expect(ledger.insertEntry).toHaveBeenCalledTimes(1);
	});

	it("reports conflict and writes nothing when the game's two rows disagree on the summary key", async () => {
		const { repo, calls } = setup({
			summaryKeys: [
				{ day: "2026-09-01", banListName: "Master Duel", season: 5 },
				{ day: "2026-09-02", banListName: "Master Duel", season: 5 },
			],
		});
		expect(await repo.annulPhaseOne(REQUEST)).toEqual({
			outcome: "conflict",
			reason: "summary-key-mismatch",
		});
		expect(calls.some((sql) => sql.startsWith("UPDATE matches"))).toBe(false);
	});

	it("reports conflict and rolls back the gate write when reconciliation drifts from player_stats", async () => {
		const { repo, ledger } = setup({ playerStats: [{ wins: 5, losses: 0, points: 999 }] });
		const result = await repo.annulPhaseOne(REQUEST);
		expect(result).toEqual({
			outcome: "conflict",
			reason: "reconciliation-drift:user-1:rank-global:5",
		});
		expect(ledger.insertEntry).not.toHaveBeenCalled();
	});

	it("on the happy path locks, writes the COALESCEd gate, reverses the ledger in order, reprojects, decrements the summary, and derives the cycle from the opposite kind", async () => {
		const { repo, calls, ledger, mgr } = setup({
			playerStats: [{ wins: 1, losses: 0, points: 15 }],
		});
		(ledger.countByKind as ReturnType<typeof mock>).mockImplementation(
			async (_g, _u, _r, kind: string) => (kind === "reinstatement" ? 2 : 3),
		);

		const result = await repo.annulPhaseOne(REQUEST);
		expect(result).toEqual({
			outcome: "annulled",
			touchedKeys: [{ userId: "user-1", rankId: "rank-global", season: 5 }],
			reversed: false,
		});

		const order = (match: string) => calls.findIndex((c) => c.includes(match));
		expect(order("game:")).toBe(0);
		expect(order("count(*)::int AS rows")).toBeLessThan(order("DISTINCT date_trunc"));
		expect(order("DISTINCT date_trunc")).toBeLessThan(order("UPDATE matches"));
		expect(order("UPDATE matches")).toBeLessThan(order("findAppliedEntries"));
		expect(order("insertEntry")).toBeLessThan(order("reprojectPlayerStats"));
		expect(order("reprojectPlayerStats")).toBeLessThan(order("stats_daily_summary"));

		const [gateSql, gateParams] = gate(mgr);
		expect(gateSql).toContain("COALESCE(anulled_user_id, $2)");
		expect(gateParams).toEqual(["game-1", "user-1", "cheating", "admin-1"]);

		const inserted = (ledger.insertEntry as ReturnType<typeof mock>).mock
			.calls[0][0] as PointsLedgerEntry;
		expect(inserted.cycle).toBe(2);

		const ladderLockCall = (mgr.query.mock.calls as unknown as [string, unknown[]][]).find(
			([sql]) => sql.includes("hashtextextended") && !sql.includes("game:"),
		);
		const [ladderLockSql, ladderLockParams] = ladderLockCall as [string, unknown[]];
		expect(ladderLockSql).not.toContain("'|'");
		expect(ladderLockSql).toContain("length($2)::text");
		expect(ladderLockParams).toEqual(["user-1", "rank-global", 5]);
	});

	it("derives reversal#1 (not reversal#0) after a prior annul-then-un-annul cycle", async () => {
		const { repo, ledger } = setup({ playerStats: [{ wins: 1, losses: 0, points: 15 }] });
		(ledger.countByKind as ReturnType<typeof mock>).mockImplementation(async () => 1);

		await repo.annulPhaseOne(REQUEST);

		const inserted = (ledger.insertEntry as ReturnType<typeof mock>).mock
			.calls[0][0] as PointsLedgerEntry;
		expect(inserted.kind).toBe("reversal");
		expect(inserted.cycle).toBe(1);
	});
});

describe("MatchAnnulmentPostgresRepository — unannulPhaseOne", () => {
	afterEach(() => mock.restore());

	it("rejects before any write: no matches row, or a game that was never annulled", async () => {
		const notFound = setup({ existence: [{ rows: 0, flagged: false }] });
		expect(await notFound.repo.unannulPhaseOne("game-1")).toEqual({ outcome: "not-found" });

		const notAnnulled = setup({ existence: [{ rows: 2, flagged: false }] });
		expect(await notAnnulled.repo.unannulPhaseOne("game-1")).toEqual({ outcome: "not-annulled" });
		expect(notAnnulled.calls.some((sql) => sql.startsWith("UPDATE matches"))).toBe(false);
		expect(notAnnulled.ledger.insertEntry).not.toHaveBeenCalled();
	});

	it("reports conflict and writes nothing when the game's two rows disagree on the summary key", async () => {
		const { repo, calls } = setup({
			existence: [{ rows: 2, flagged: true }],
			summaryKeys: [
				{ day: "2026-09-01", banListName: "Master Duel", season: 5 },
				{ day: "2026-09-02", banListName: "Master Duel", season: 5 },
			],
		});
		expect(await repo.unannulPhaseOne("game-1")).toEqual({
			outcome: "conflict",
			reason: "summary-key-mismatch",
		});
		expect(calls.some((sql) => sql.startsWith("UPDATE matches"))).toBe(false);
	});

	it("clears the flag but writes no reinstatement and does not touch the summary for a legacy flagged game with no committed reversal", async () => {
		const { repo, calls, ledger, mgr } = setup({
			existence: [{ rows: 2, flagged: true }],
			reversedFlag: [{ reversed: false }],
			reversalRows: [],
		});

		const result = await repo.unannulPhaseOne("game-1");
		expect(result).toEqual({ outcome: "un-annulled", touchedKeys: [], reversed: false });
		expect(ledger.insertEntry).not.toHaveBeenCalled();
		expect(
			calls.some(
				(sql) =>
					sql.startsWith("UPDATE stats_daily_summary") ||
					sql.startsWith("INSERT INTO stats_daily_summary"),
			),
		).toBe(false);
		expect(gate(mgr)[0]).toContain("anulled_user_id = NULL");
	});

	it("on the happy path locks, nulls the audit fields, reinstates the ledger in order, reprojects, re-increments the summary, and derives cycle = reversalCount - 1", async () => {
		const { repo, calls, ledger, mgr } = setup({
			existence: [{ rows: 2, flagged: true }],
			reversedFlag: [{ reversed: true }],
			playerStats: [{ wins: 1, losses: 0, points: 15 }],
		});
		(ledger.countByKind as ReturnType<typeof mock>).mockImplementation(
			async (_g, _u, _r, kind: string) => (kind === "reversal" ? 2 : 3),
		);

		const result = await repo.unannulPhaseOne("game-1");
		expect(result).toEqual({
			outcome: "un-annulled",
			touchedKeys: [{ userId: "user-1", rankId: "rank-global", season: 5 }],
			reversed: true,
		});

		const order = (match: string) => calls.findIndex((c) => c.includes(match));
		expect(order("game:")).toBe(0);
		expect(order("count(*)::int AS rows")).toBeLessThan(order("DISTINCT date_trunc"));
		expect(order("DISTINCT date_trunc")).toBeLessThan(order("UPDATE matches"));
		expect(order("UPDATE matches")).toBeLessThan(order("insertEntry"));
		expect(order("insertEntry")).toBeLessThan(order("reprojectPlayerStats"));
		expect(order("reprojectPlayerStats")).toBeLessThan(order("INSERT INTO stats_daily_summary"));

		const [gateSql] = gate(mgr);
		expect(gateSql).toContain("anulled_reason = NULL");

		const inserted = (ledger.insertEntry as ReturnType<typeof mock>).mock
			.calls[0][0] as PointsLedgerEntry;
		expect(inserted.kind).toBe("reinstatement");
		expect(inserted.cycle).toBe(1);
	});
});
