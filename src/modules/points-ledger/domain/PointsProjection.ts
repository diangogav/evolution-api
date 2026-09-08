import { PointsLedgerEntry, PointsLedgerKind } from "./PointsLedgerEntry";

export type ProjectedPlayerStats = { wins: number; losses: number; points: number };

export type LedgerKindCounts = { reversalCount: number; reinstatementCount: number };

// Replays ledger history into the value player_stats should hold. A plain
// sum, no clamping: match points can be legitimately negative.
export function projectPlayerStats(
	entries: PointsLedgerEntry[],
	achievementPoints: number,
): ProjectedPlayerStats {
	let wins = 0;
	let losses = 0;
	let points = 0;

	for (const entry of entries) {
		wins += entry.winsDelta;
		losses += entry.lossesDelta;
		points += entry.pointsDelta;
	}

	return { wins, losses, points: points + achievementPoints };
}

// D1.1 cycle derivation: each kind counts the OPPOSITE kind, so an operation
// never increments its own counter and a retry recomputes the same value.
export function nextCycle(kind: PointsLedgerKind, counts: LedgerKindCounts): number {
	if (kind === "applied") return 0;
	if (kind === "reversal") return counts.reinstatementCount;
	return counts.reversalCount - 1;
}
