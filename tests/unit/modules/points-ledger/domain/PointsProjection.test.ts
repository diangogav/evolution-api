import { expect, it } from "bun:test";

import { PointsLedgerEntry } from "../../../../../src/modules/points-ledger/domain/PointsLedgerEntry";
import {
	nextCycle,
	projectPlayerStats,
} from "../../../../../src/modules/points-ledger/domain/PointsProjection";

function entry(overrides: Partial<PointsLedgerEntry> = {}): PointsLedgerEntry {
	return {
		gameId: "game-1",
		userId: "user-1",
		rankId: "rank-1",
		season: 5,
		kind: "applied",
		cycle: 0,
		pointsDelta: 15,
		winsDelta: 1,
		lossesDelta: 0,
		...overrides,
	};
}

it("projectPlayerStats sums ledger deltas plus achievement points, preserving a negative total", () => {
	const entries = [
		entry({ pointsDelta: 15, winsDelta: 1, lossesDelta: 0 }),
		entry({ gameId: "game-2", pointsDelta: -8, winsDelta: 0, lossesDelta: 1 }),
	];
	expect(projectPlayerStats(entries, 5)).toEqual({ wins: 1, losses: 1, points: 12 });

	const lossOnly = [entry({ pointsDelta: -8, winsDelta: 0, lossesDelta: 1 })];
	expect(projectPlayerStats(lossOnly, 0).points).toBe(-8);
});

it("projectPlayerStats stays stable across an annul, un-annul, then annul-again cycle", () => {
	// applied#0 +15, reversal#0 -15, reinstatement#0 +15, reversal#1 -15:
	// the second annul must reduce points exactly as the first one did.
	const entries = [
		entry({ kind: "applied", cycle: 0, pointsDelta: 15, winsDelta: 1, lossesDelta: 0 }),
		entry({ kind: "reversal", cycle: 0, pointsDelta: -15, winsDelta: -1, lossesDelta: 0 }),
		entry({ kind: "reinstatement", cycle: 0, pointsDelta: 15, winsDelta: 1, lossesDelta: 0 }),
		entry({ kind: "reversal", cycle: 1, pointsDelta: -15, winsDelta: -1, lossesDelta: 0 }),
	];

	expect(projectPlayerStats(entries, 0)).toEqual({ wins: 0, losses: 0, points: 0 });
});

it("nextCycle counts the opposite kind: applied is 0, reversal counts reinstatements, reinstatement counts reversals minus one", () => {
	expect(nextCycle("applied", { reversalCount: 3, reinstatementCount: 2 })).toBe(0);
	expect(nextCycle("reversal", { reversalCount: 0, reinstatementCount: 0 })).toBe(0);
	expect(nextCycle("reversal", { reversalCount: 1, reinstatementCount: 1 })).toBe(1);
	expect(nextCycle("reinstatement", { reversalCount: 1, reinstatementCount: 0 })).toBe(0);
	expect(nextCycle("reinstatement", { reversalCount: 2, reinstatementCount: 1 })).toBe(1);
	expect(nextCycle("reinstatement", { reversalCount: 0, reinstatementCount: 0 })).toBe(-1);
});
