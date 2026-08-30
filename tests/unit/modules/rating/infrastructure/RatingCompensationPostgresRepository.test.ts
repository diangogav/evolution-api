import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { RatingCompensationPostgresRepository } from "../../../../../src/modules/rating/infrastructure/RatingCompensationPostgresRepository";
import { AppliedRatingHistoryRecord } from "../../../../../src/modules/rating/domain/RatingCompensationRepository";

function appliedRow(
	overrides: Partial<AppliedRatingHistoryRecord> = {},
): AppliedRatingHistoryRecord {
	return {
		matchId: "match-1",
		userId: "user-1",
		banListName: "Global",
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
			.mockResolvedValueOnce([{ id: "history-row-1" }]) // reversal insert
			.mockResolvedValueOnce([{ kind: "applied", delta: 15 }]); // history for reprojection

		const applied = await repository.insertReversal(appliedRow(), -15);

		expect(applied).toBe(true);
		expect(transactionSpy).toHaveBeenCalledTimes(1);
		expect(manager.query).toHaveBeenCalledTimes(3);
	});

	it("does not touch player_ratings when the reversal insert is a no-op (already compensated)", async () => {
		manager.query.mockResolvedValueOnce([]); // ON CONFLICT DO NOTHING — no row inserted

		const applied = await repository.insertReversal(appliedRow(), -15);

		expect(applied).toBe(false);
		expect(manager.query).toHaveBeenCalledTimes(1);
	});

	it("recomputes rating and peak from the full rating_history chronology, not by patching peak incrementally", async () => {
		// Original match pushed the player to a season-high of 1080 (peak),
		// then the reversal must bring rating back down AND recompute peak
		// from history — not leave the stale 1080 peak in place.
		manager.query
			.mockResolvedValueOnce([{ id: "reversal-row-1" }]) // reversal insert succeeds
			.mockResolvedValueOnce([
				{ kind: "applied", delta: 80 }, // rating 1080, peak 1080
				{ kind: "reversal", delta: -80 }, // this reversal — rating back to 1000
			]);

		await repository.insertReversal(appliedRow({ delta: 80 }), -80);

		const projectionCall = manager.query.mock.calls[2] as [string, unknown[]];
		const [sql, params] = projectionCall;
		expect(sql).toContain("player_ratings");
		expect(params).toEqual(["user-1", "Global", 5, 1000, 0, 1080]);
	});

	it("rolls games_played back to applied-minus-reversed rows, floored at zero", async () => {
		manager.query.mockResolvedValueOnce([{ id: "reversal-row-1" }]).mockResolvedValueOnce([
			{ kind: "applied", delta: 10 },
			{ kind: "applied", delta: 5 },
			{ kind: "reversal", delta: -10 },
		]);

		await repository.insertReversal(appliedRow(), -10);

		const [, params] = manager.query.mock.calls[2] as [string, unknown[]];
		expect(params?.[4]).toBe(1); // 2 applied - 1 reversal
	});
});
