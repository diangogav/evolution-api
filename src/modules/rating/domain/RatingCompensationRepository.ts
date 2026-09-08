export type AppliedRatingHistoryRecord = {
	matchId: string;
	userId: string;
	rankId: string;
	season: number;
	previousRating: number;
	delta: number;
	kFactor: number;
	opponentRating: number;
};

// A reversal row still open for reinstatement, i.e. one this match/user/rank
// has not yet had undone at its own cycle.
export type OpenReversalRecord = AppliedRatingHistoryRecord & { cycle: number };

export interface RatingCompensationRepository {
	findAppliedHistory(matchId: string): Promise<AppliedRatingHistoryRecord[]>;
	/**
	 * Writes the reversal of `entry`. `requestedDelta` is the movement the
	 * reversal asks for; the implementation stores only the part the rating can
	 * absorb under the floor, measured against the rating the player holds when
	 * the row is written. Returns false when the reversal already exists.
	 */
	insertReversal(entry: AppliedRatingHistoryRecord, requestedDelta: number): Promise<boolean>;
	/**
	 * Reversal rows for `matchId` that have not yet been reinstated at their
	 * own cycle — one per (user, rank) still owed a reinstatement.
	 */
	findOpenReversals(matchId: string): Promise<OpenReversalRecord[]>;
	/**
	 * Writes the reinstatement of `entry` (an open reversal). Same
	 * floor-safety and idempotency contract as `insertReversal`.
	 */
	insertReinstatement(entry: OpenReversalRecord, requestedDelta: number): Promise<boolean>;
}
