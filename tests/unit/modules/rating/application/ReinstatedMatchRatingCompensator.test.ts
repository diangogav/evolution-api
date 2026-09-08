import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { ReinstatedMatchRatingCompensator } from "../../../../../src/modules/rating/application/ReinstatedMatchRatingCompensator";
import {
	OpenReversalRecord,
	RatingCompensationRepository,
} from "../../../../../src/modules/rating/domain/RatingCompensationRepository";

function openReversal(overrides: Partial<OpenReversalRecord> = {}): OpenReversalRecord {
	return {
		matchId: "match-1",
		userId: "user-1",
		rankId: "rank-global",
		season: 5,
		previousRating: 985,
		delta: -15,
		kFactor: 40,
		opponentRating: 1000,
		cycle: 0,
		...overrides,
	};
}

describe("ReinstatedMatchRatingCompensator", () => {
	let repository: RatingCompensationRepository;
	let compensator: ReinstatedMatchRatingCompensator;

	beforeEach(() => {
		repository = {
			findAppliedHistory: async () => [],
			insertReversal: async () => true,
			findOpenReversals: async () => [],
			insertReinstatement: async () => true,
		};
		compensator = new ReinstatedMatchRatingCompensator(repository);
	});

	it("negates the open reversal's own delta for each affected player, restoring the pre-annul rating", async () => {
		const rows = [
			openReversal({ userId: "user-1", delta: -15 }),
			openReversal({ userId: "user-2", delta: 15 }),
		];
		spyOn(repository, "findOpenReversals").mockResolvedValue(rows);
		const insertReinstatementSpy = spyOn(repository, "insertReinstatement").mockResolvedValue(true);

		const result = await compensator.reinstate("match-1");

		expect(insertReinstatementSpy).toHaveBeenCalledTimes(2);
		expect(insertReinstatementSpy).toHaveBeenNthCalledWith(1, rows[0], 15);
		expect(insertReinstatementSpy).toHaveBeenNthCalledWith(2, rows[1], -15);
		expect(result).toEqual({ reinstated: 2, skipped: 0 });
	});

	it("negates a floored reversal (stored delta 0) by requesting zero movement, still landing on the pre-annul rating", async () => {
		const rows = [openReversal({ delta: 0 })];
		spyOn(repository, "findOpenReversals").mockResolvedValue(rows);
		const insertReinstatementSpy = spyOn(repository, "insertReinstatement").mockResolvedValue(true);

		const result = await compensator.reinstate("match-1");

		expect(insertReinstatementSpy).toHaveBeenCalledTimes(1);
		expect(insertReinstatementSpy.mock.calls[0]?.[1]).toBe(-0);
		expect(result).toEqual({ reinstated: 1, skipped: 0 });
	});

	it("counts an already-reinstated open reversal as skipped, not reinstated", async () => {
		const rows = [openReversal({ userId: "user-1", delta: -15 })];
		spyOn(repository, "findOpenReversals").mockResolvedValue(rows);
		spyOn(repository, "insertReinstatement").mockResolvedValue(false);

		const result = await compensator.reinstate("match-1");

		expect(result).toEqual({ reinstated: 0, skipped: 1 });
	});

	it("does nothing for a match with no open reversals", async () => {
		spyOn(repository, "findOpenReversals").mockResolvedValue([]);
		const insertReinstatementSpy = spyOn(repository, "insertReinstatement");

		const result = await compensator.reinstate("never-annulled-match");

		expect(insertReinstatementSpy).not.toHaveBeenCalled();
		expect(result).toEqual({ reinstated: 0, skipped: 0 });
	});
});
