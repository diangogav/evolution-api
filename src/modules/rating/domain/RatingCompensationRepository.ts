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

export interface RatingCompensationRepository {
	findAppliedHistory(matchId: string): Promise<AppliedRatingHistoryRecord[]>;
	/**
	 * Writes the reversal of `entry`. `requestedDelta` is the movement the
	 * reversal asks for; the implementation stores only the part the rating can
	 * absorb under the floor, measured against the rating the player holds when
	 * the row is written. Returns false when the reversal already exists.
	 */
	insertReversal(entry: AppliedRatingHistoryRecord, requestedDelta: number): Promise<boolean>;
}
