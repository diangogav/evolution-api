export type PointsLedgerKind = "applied" | "reversal" | "reinstatement";

export type PointsLedgerEntry = {
	gameId: string;
	userId: string;
	rankId: string;
	season: number;
	kind: PointsLedgerKind;
	cycle: number;
	pointsDelta: number;
	winsDelta: number;
	lossesDelta: number;
};
