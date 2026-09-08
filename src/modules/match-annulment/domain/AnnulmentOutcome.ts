export type AnnulOutcome = "annulled" | "already" | "not-found" | "conflict" | "partial";

export type UnannulOutcome = "un-annulled" | "not-annulled" | "not-found" | "conflict" | "partial";

// Shared per-game shape for both batch use cases; eloReinstated stays 0 for
// both directions until unit 11 ships reinstatement.
export type GameOutcomeResult<TOutcome extends string> = {
	gameId: string;
	outcome: TOutcome;
	pointsRows: number;
	eloReversed: number;
	eloSkipped: number;
	eloReinstated: number;
	reason?: string;
	error?: string;
};
