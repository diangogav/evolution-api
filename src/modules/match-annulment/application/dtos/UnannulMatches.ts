import { GameOutcomeResult, UnannulOutcome } from "../../domain/AnnulmentOutcome";

export type UnannulMatchesRequest = { gameIds: string[] };

export type UnannulGameResult = GameOutcomeResult<UnannulOutcome>;

export type UnannulMatchesResponse = {
	results: UnannulGameResult[];
	totals: { eloReinstated: number };
};
