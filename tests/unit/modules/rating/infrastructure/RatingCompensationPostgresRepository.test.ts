import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { RatingCompensationPostgresRepository } from "../../../../../src/modules/rating/infrastructure/RatingCompensationPostgresRepository";
import {
	AppliedRatingHistoryRecord,
	OpenReversalRecord,
} from "../../../../../src/modules/rating/domain/RatingCompensationRepository";

function appliedRow(
	overrides: Partial<AppliedRatingHistoryRecord> = {},
): AppliedRatingHistoryRecord {
	return {
		matchId: "match-1",
		userId: "user-1",
		rankId: "rank-global",
		season: 5,
		previousRating: 1000,
		delta: 15,
		kFactor: 40,
		opponentRating: 1000,
		...overrides,
	};
}

describe("RatingCompensationPostgresRepository — insertReversal", () => {
	let manager: { query: ReturnType<typeof mock> };
	let transactionSpy: ReturnType<typeof spyOn>;
	let repository: RatingCompensationPostgresRepository;

	beforeEach(() => {
		manager = { query: mock() };
		transactionSpy = spyOn(dataSource, "transaction").mockImplementation((async (
			work: (manager: unknown) => Promise<unknown>,
		) => work(manager)) as never);
		repository = new RatingCompensationPostgresRepository();
	});

	it("runs the reversal insert and the projection update inside one dataSource.transaction", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }]) // history for reprojection
			.mockResolvedValueOnce([{ id: "history-row-1" }]); // reversal insert

		const applied = await repository.insertReversal(appliedRow(), -15);

		expect(applied).toBe(true);
		expect(transactionSpy).toHaveBeenCalledTimes(1);
		expect(manager.query).toHaveBeenCalledTimes(4);
	});

	it("issues a target-less ON CONFLICT DO NOTHING, so the insert resolves against whichever unique index on rating_history is currently declared, and writes cycle 0", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }]) // history for reprojection
			.mockResolvedValueOnce([{ id: "history-row-1" }]); // reversal insert

		await repository.insertReversal(appliedRow(), -15);

		const [insertSql, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];

		expect(insertSql).toContain("ON CONFLICT DO NOTHING");
		expect(insertSql).not.toEqual(expect.stringContaining("ON CONFLICT ("));
		expect(insertParams?.[insertParams.length - 1]).toBe(0);
	});

	it("derives the reversal's cycle from the count of reinstatement rows already recorded for this match/user/rank", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ matchId: "match-1", kind: "applied", delta: 15 },
				{ matchId: "match-1", kind: "reversal", delta: -15 },
				{ matchId: "match-1", kind: "reinstatement", delta: 15 },
				// A different match's reinstatement in the same season must not count.
				{ matchId: "match-other", kind: "reinstatement", delta: 10 },
			]) // history for reprojection, scoped by user/rank/season across matches
			.mockResolvedValueOnce([{ id: "history-row-2" }]); // reversal insert

		await repository.insertReversal(appliedRow(), -15);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];

		expect(insertParams?.[insertParams.length - 1]).toBe(1);
	});

	it("does not touch player_ratings when the reversal insert is a no-op (already compensated)", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }]) // history for reprojection
			.mockResolvedValueOnce([]); // ON CONFLICT DO NOTHING — no row inserted

		const applied = await repository.insertReversal(appliedRow(), -15);

		expect(applied).toBe(false);
		expect(manager.query).toHaveBeenCalledTimes(3);
		const executedSql = manager.query.mock.calls.map(([sql]) => sql as string);
		expect(executedSql.some((sql) => sql.includes("player_ratings"))).toBe(false);
	});

	it("acquires an advisory lock scoped to user/rank/season before reading rating_history, so the projection read-recompute-write is race-free even when player_ratings has no row yet", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }]) // history for reprojection
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]); // reversal insert

		await repository.insertReversal(appliedRow(), -15);

		const [lockSql, lockParams] = manager.query.mock.calls[0] as [string, unknown[]];
		const [historySql] = manager.query.mock.calls[1] as [string, unknown[]];

		expect(lockSql).toContain("pg_advisory_xact_lock");
		expect(lockParams).toEqual(["user-1", "rank-global", 5]);
		expect(historySql).toContain("FROM rating_history");
	});

	it("scopes the reversal ON CONFLICT key by rank_id, so a match annulled across two ladders reverses both", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock — ban list ladder
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }])
			.mockResolvedValueOnce([{ id: "reversal-row-banlist" }])
			.mockResolvedValueOnce(undefined) // projection upsert
			.mockResolvedValueOnce(undefined) // advisory lock — group ladder
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }])
			.mockResolvedValueOnce([{ id: "reversal-row-group" }]);

		const banList = await repository.insertReversal(appliedRow({ rankId: "rank-banlist" }), -15);
		const group = await repository.insertReversal(appliedRow({ rankId: "rank-group" }), -15);

		expect(banList).toBe(true);
		expect(group).toBe(true);

		const [banListSql, banListParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [groupSql, groupParams] = manager.query.mock.calls[6] as [string, unknown[]];

		expect(banListSql).toContain("ON CONFLICT DO NOTHING");
		expect(groupSql).toContain("ON CONFLICT DO NOTHING");
		expect(banListParams?.[2]).toBe("rank-banlist");
		expect(groupParams?.[2]).toBe("rank-group");
	});

	it("recomputes rating and peak from the full rating_history chronology, not by patching peak incrementally", async () => {
		// Original match pushed the player to a season-high of 1080 (peak),
		// then the reversal must bring rating back down AND recompute peak
		// from history — not leave the stale 1080 peak in place.
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([{ kind: "applied", delta: 80 }]) // rating 1080, peak 1080
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]); // reversal insert succeeds

		await repository.insertReversal(appliedRow({ delta: 80 }), -80);

		const projectionCall = manager.query.mock.calls[3] as [string, unknown[]];
		const [sql, params] = projectionCall;
		expect(sql).toContain("player_ratings");
		expect(params).toEqual(["user-1", "rank-global", 5, 1000, 0, 1080]);
	});

	it("rolls games_played back to applied-minus-reversed rows, floored at zero", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ kind: "applied", delta: 10 },
				{ kind: "applied", delta: 5 },
			])
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]);

		await repository.insertReversal(appliedRow(), -10);

		const [, params] = manager.query.mock.calls[3] as [string, unknown[]];
		expect(params?.[4]).toBe(1); // 2 applied - 1 reversal
	});

	it("stores the requested delta untouched when the floor does not truncate it", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }]) // rating 1015
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]);

		await repository.insertReversal(appliedRow(), -15);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [, projectionParams] = manager.query.mock.calls[3] as [string, unknown[]];

		expect(insertParams?.[5]).toBe(-15);
		expect(projectionParams?.[3]).toBe(1000);
	});

	it("records the rating the reversal starts from, so the row reconciles with what it produces", async () => {
		// The applied row started from 110; the reversal starts from where the
		// player stands now, 100. Copying 110 across would describe a starting
		// point this row never had, and 110 + 10 would not be the 110 it lands on.
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ kind: "applied", delta: -890 }, // rating 110
				{ kind: "applied", delta: -10 }, // floored loss — rating 100
			])
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]);

		await repository.insertReversal(appliedRow({ previousRating: 110, delta: -10 }), 10);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const previousRating = insertParams?.[4] as number;
		const delta = insertParams?.[5] as number;

		expect(previousRating).toBe(100);
		expect(previousRating + delta).toBe(110);
	});

	it("restores exactly the pre-loss rating when reversing a loss the floor truncated", async () => {
		// The applied row recorded the -10 the rating absorbed, not the -30 the
		// Elo curve produced, so undoing it lands on 110 and not on 130.
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ kind: "applied", delta: -890 }, // rating 110
				{ kind: "applied", delta: -10 }, // floored loss — rating 100
			])
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]);

		await repository.insertReversal(appliedRow({ previousRating: 110, delta: -10 }), 10);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [, projectionParams] = manager.query.mock.calls[3] as [string, unknown[]];

		expect(insertParams?.[5]).toBe(10);
		expect(projectionParams?.[3]).toBe(110);
	});

	it("stores only the delta the floor admits when the reversal would push the rating below it", async () => {
		// The win being annulled was +15, but the player has since dropped to
		// 105: only 5 of those points are still there to take back.
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ kind: "applied", delta: 15 },
				{ kind: "applied", delta: -910 }, // rating 105
			])
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]);

		await repository.insertReversal(appliedRow({ delta: 15 }), -15);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [, projectionParams] = manager.query.mock.calls[3] as [string, unknown[]];

		expect(insertParams?.[5]).toBe(-5);
		expect(projectionParams?.[3]).toBe(100);
	});

	it("writes a reversal the plain-sum reprojection reproduces, so the row and the stored rating agree", async () => {
		const history = [
			{ kind: "applied" as const, delta: 15 },
			{ kind: "applied" as const, delta: -910 },
		];
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce(history)
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]);

		await repository.insertReversal(appliedRow({ delta: 15 }), -15);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [, projectionParams] = manager.query.mock.calls[3] as [string, unknown[]];
		const storedDelta = insertParams?.[5] as number;
		const replayed = [...history, { kind: "reversal" as const, delta: storedDelta }].reduce(
			(rating, row) => rating + row.delta,
			1000,
		);

		expect(projectionParams?.[3]).toBe(replayed);
	});
});

describe("RatingCompensationPostgresRepository — findOpenReversals", () => {
	it("excludes a reversal already reinstated at the same cycle, via a same-cycle anti-join", async () => {
		const querySpy = spyOn(dataSource, "query").mockResolvedValue([]);
		const repository = new RatingCompensationPostgresRepository();

		await repository.findOpenReversals("match-1");

		expect(querySpy).toHaveBeenCalledTimes(1);
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("kind = 'reversal'");
		expect(sql).toContain("kind = 'reinstatement'");
		expect(sql).toContain("cycle = r.cycle");
		expect(params).toEqual(["match-1"]);

		querySpy.mockRestore();
	});
});

describe("RatingCompensationPostgresRepository — insertReinstatement", () => {
	let manager: { query: ReturnType<typeof mock> };
	let repository: RatingCompensationPostgresRepository;

	function openReversal(overrides: Partial<OpenReversalRecord> = {}): OpenReversalRecord {
		return { ...appliedRow(), cycle: 0, ...overrides };
	}

	beforeEach(() => {
		manager = { query: mock() };
		spyOn(dataSource, "transaction").mockImplementation((async (
			work: (manager: unknown) => Promise<unknown>,
		) => work(manager)) as never);
		repository = new RatingCompensationPostgresRepository();
	});

	it("derives the reinstatement's cycle as this match's reversal count minus one", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ matchId: "match-1", kind: "applied", delta: 15 },
				{ matchId: "match-1", kind: "reversal", delta: -15 },
			]) // history for reprojection
			.mockResolvedValueOnce([{ id: "reinstatement-row-1" }]); // reinstatement insert

		const applied = await repository.insertReinstatement(openReversal({ delta: -15 }), 15);

		expect(applied).toBe(true);
		const [insertSql, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		expect(insertSql).toContain("'reinstatement'");
		expect(insertSql).toContain("ON CONFLICT DO NOTHING");
		expect(insertParams?.[insertParams.length - 1]).toBe(0); // 1 reversal - 1
	});

	it("restores exactly the pre-reversal rating when negating an unfloored reversal", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ matchId: "match-1", kind: "applied", delta: -890 }, // rating 110
				{ matchId: "match-1", kind: "reversal", delta: 15 }, // rating 125
			])
			.mockResolvedValueOnce([{ id: "reinstatement-row-1" }]);

		await repository.insertReinstatement(openReversal({ delta: 15 }), -15);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [, projectionParams] = manager.query.mock.calls[3] as [string, unknown[]];

		expect(insertParams?.[5]).toBe(-15);
		expect(projectionParams?.[3]).toBe(110);
	});

	it("floors the reinstatement's negation against the live rating, same as a reversal", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ matchId: "match-1", kind: "applied", delta: -890 }, // rating 110
				{ matchId: "match-1", kind: "reversal", delta: -10 }, // floored reversal — rating 100
			])
			.mockResolvedValueOnce([{ id: "reinstatement-row-1" }]);

		// Undoing the reversal asks for +10 back, but the reversal itself only
		// ever took -10 (not the full -15 the reversal wanted), so asking to
		// give back what the *reversal* row stored (10) lands exactly on 110 —
		// the pre-annul rating — even though nothing here is floored again.
		await repository.insertReinstatement(openReversal({ delta: -10 }), 10);

		const [, insertParams] = manager.query.mock.calls[2] as [string, unknown[]];
		const [, projectionParams] = manager.query.mock.calls[3] as [string, unknown[]];

		expect(insertParams?.[5]).toBe(10);
		expect(projectionParams?.[3]).toBe(110);
	});

	it("does not touch player_ratings when the reinstatement insert is a no-op (already reinstated)", async () => {
		manager.query
			.mockResolvedValueOnce(undefined) // advisory lock
			.mockResolvedValueOnce([
				{ matchId: "match-1", kind: "applied", delta: 15 },
				{ matchId: "match-1", kind: "reversal", delta: -15 },
			])
			.mockResolvedValueOnce([]); // ON CONFLICT DO NOTHING — no row inserted

		const applied = await repository.insertReinstatement(openReversal({ delta: -15 }), 15);

		expect(applied).toBe(false);
		expect(manager.query).toHaveBeenCalledTimes(3);
		const executedSql = manager.query.mock.calls.map(([sql]) => sql as string);
		expect(executedSql.some((sql) => sql.includes("player_ratings"))).toBe(false);
	});
});
