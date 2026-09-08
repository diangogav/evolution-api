import { ConflictError } from "../../../shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { MatchAnnulmentRepository } from "../domain/MatchAnnulmentRepository";
import { PhaseOneResult } from "../domain/PhaseOneResult";
import {
	UnannulGameResult,
	UnannulMatchesRequest,
	UnannulMatchesResponse,
} from "./dtos/UnannulMatches";

// Structural port matching ReinstatedMatchRatingCompensator's Elo phase-2 shape.
export type EloReinstatementCompensator = {
	reinstate(gameId: string): Promise<{ reinstated: number; skipped: number }>;
};

export class UnannulMatchesUseCase {
	constructor(
		private readonly repository: MatchAnnulmentRepository,
		private readonly compensator: EloReinstatementCompensator,
		private readonly enabled: boolean,
	) {}

	async run(request: UnannulMatchesRequest): Promise<UnannulMatchesResponse> {
		if (request.gameIds.length === 0) throw new InvalidArgumentError("gameIds must not be empty");
		if (!this.enabled) throw new ConflictError("Match annulment is disabled");

		const results: UnannulGameResult[] = [];
		for (const gameId of request.gameIds) {
			results.push(await this.processGame(gameId));
		}

		const totals = results.reduce(
			(acc, result) => ({
				eloReinstated: acc.eloReinstated + result.eloReinstated,
				eloSkipped: acc.eloSkipped + result.eloSkipped,
			}),
			{ eloReinstated: 0, eloSkipped: 0 },
		);

		return { results, totals };
	}

	private async processGame(gameId: string): Promise<UnannulGameResult> {
		const base = { gameId, pointsRows: 0, eloReversed: 0, eloSkipped: 0, eloReinstated: 0 };

		const phaseOne = await this.runPhaseOne(gameId);
		if (phaseOne.outcome === "not-found") return { ...base, outcome: "not-found" };
		if (phaseOne.outcome === "conflict")
			return { ...base, outcome: "conflict", reason: phaseOne.reason };

		const unannulled = phaseOne.outcome === "un-annulled";
		const pointsRows = unannulled ? phaseOne.touchedKeys.length : 0;

		try {
			const { reinstated, skipped } = await this.compensator.reinstate(gameId);
			return {
				...base,
				outcome: unannulled ? "un-annulled" : "not-annulled",
				pointsRows,
				eloReinstated: reinstated,
				eloSkipped: skipped,
			};
		} catch (error) {
			return { ...base, outcome: "partial", pointsRows, error: errorMessage(error) };
		}
	}

	// Same reasoning as AnnulMatchesUseCase.runPhaseOne (see there).
	private async runPhaseOne(gameId: string): Promise<PhaseOneResult> {
		try {
			return await this.repository.unannulPhaseOne(gameId);
		} catch (error) {
			return {
				outcome: "conflict",
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
