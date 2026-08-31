export type AppliedRatingHistoryRecord = {
	matchId: string;
	userId: string;
	banListName: string;
	season: number;
	previousRating: number;
	delta: number;
	kFactor: number;
	opponentRating: number;
};

export interface RatingCompensationRepository {
	findAppliedHistory(matchId: string): Promise<AppliedRatingHistoryRecord[]>;
	insertReversal(entry: AppliedRatingHistoryRecord, reversalDelta: number): Promise<boolean>;
}
