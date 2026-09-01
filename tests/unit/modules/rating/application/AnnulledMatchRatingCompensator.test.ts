import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { AnnulledMatchRatingCompensator } from "../../../../../src/modules/rating/application/AnnulledMatchRatingCompensator";
import {
	AppliedRatingHistoryRecord,
	RatingCompensationRepository,
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

describe("AnnulledMatchRatingCompensator", () => {
	let repository: RatingCompensationRepository;
	let compensator: AnnulledMatchRatingCompensator;

	beforeEach(() => {
		repository = {
			findAppliedHistory: async () => [],
			insertReversal: async () => true,
		};
		compensator = new AnnulledMatchRatingCompensator(repository);
	});

	it("writes one inverse-delta reversal per affected player for a rated match", async () => {
		const rows = [
			appliedRow({ userId: "user-1", delta: 15 }),
			appliedRow({ userId: "user-2", delta: -15 }),
		];
		spyOn(repository, "findAppliedHistory").mockResolvedValue(rows);
		const insertReversalSpy = spyOn(repository, "insertReversal").mockResolvedValue(true);

		const result = await compensator.compensate("match-1");

		expect(insertReversalSpy).toHaveBeenCalledTimes(2);
		expect(insertReversalSpy).toHaveBeenNthCalledWith(1, rows[0], -15);
		expect(insertReversalSpy).toHaveBeenNthCalledWith(2, rows[1], 15);
		expect(result).toEqual({ reversed: 2, skipped: 0 });
	});

	it("reverses every ladder a match fed, not just the first one", async () => {
		const rows = [
			appliedRow({ userId: "user-1", rankId: "rank-banlist", delta: 15 }),
			appliedRow({ userId: "user-2", rankId: "rank-banlist", delta: -15 }),
			appliedRow({ userId: "user-1", rankId: "rank-group", delta: 12 }),
			appliedRow({ userId: "user-2", rankId: "rank-group", delta: -12 }),
		];
		spyOn(repository, "findAppliedHistory").mockResolvedValue(rows);
		const insertReversalSpy = spyOn(repository, "insertReversal").mockResolvedValue(true);

		const result = await compensator.compensate("match-1");

		expect(insertReversalSpy).toHaveBeenCalledTimes(4);
		expect(insertReversalSpy).toHaveBeenNthCalledWith(3, rows[2], -12);
		expect(insertReversalSpy).toHaveBeenNthCalledWith(4, rows[3], 12);
		expect(result).toEqual({ reversed: 4, skipped: 0 });
	});

	it("is idempotent — re-running an already-compensated match writes no duplicate reversal", async () => {
		const rows = [appliedRow({ userId: "user-1", delta: 15 })];
		spyOn(repository, "findAppliedHistory").mockResolvedValue(rows);
		spyOn(repository, "insertReversal").mockResolvedValue(false);

		const result = await compensator.compensate("match-1");

		expect(result).toEqual({ reversed: 0, skipped: 1 });
	});

	it("does nothing for a match with no applied rating history", async () => {
		spyOn(repository, "findAppliedHistory").mockResolvedValue([]);
		const insertReversalSpy = spyOn(repository, "insertReversal");

		const result = await compensator.compensate("never-rated-match");

		expect(insertReversalSpy).not.toHaveBeenCalled();
		expect(result).toEqual({ reversed: 0, skipped: 0 });
	});
});
