import { AnnulOutcome, GameOutcomeResult } from "../../domain/AnnulmentOutcome";

export type AnnulMatchesRequest = {
	gameIds: string[];
	reason: string;
	offenderUserId: string;
	adminUserId: string;
};

export type AnnulGameResult = GameOutcomeResult<AnnulOutcome>;

export type AnnulMatchesResponse = {
	results: AnnulGameResult[];
	totals: { eloReversed: number; eloSkipped: number };
};
