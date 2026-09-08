import { ConflictError } from "../../../shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { MatchAnnulmentRepository } from "../domain/MatchAnnulmentRepository";
import { PhaseOneResult } from "../domain/PhaseOneResult";
import { AnnulGameResult, AnnulMatchesRequest, AnnulMatchesResponse } from "./dtos/AnnulMatches";

// Structural port matching AnnulledMatchRatingCompensator's Elo phase-2 shape.
export type EloAnnulmentCompensator = {
	compensate(gameId: string): Promise<{ reversed: number; skipped: number }>;
};

export class AnnulMatchesUseCase {
	constructor(
		private readonly repository: MatchAnnulmentRepository,
		private readonly compensator: EloAnnulmentCompensator,
		private readonly enabled: boolean,
	) {}

	async run(request: AnnulMatchesRequest): Promise<AnnulMatchesResponse> {
		if (request.gameIds.length === 0) throw new InvalidArgumentError("gameIds must not be empty");
		if (!request.reason.trim()) throw new InvalidArgumentError("reason is required");
		if (!this.enabled) throw new ConflictError("Match annulment is disabled");

		const results: AnnulGameResult[] = [];
		for (const gameId of request.gameIds) {
			results.push(await this.processGame(gameId, request));
		}

		const totals = results.reduce(
			(acc, result) => ({
				eloReversed: acc.eloReversed + result.eloReversed,
				eloSkipped: acc.eloSkipped + result.eloSkipped,
			}),
			{ eloReversed: 0, eloSkipped: 0 },
		);

		return { results, totals };
	}

	private async processGame(
		gameId: string,
		request: AnnulMatchesRequest,
	): Promise<AnnulGameResult> {
		const base = { gameId, pointsRows: 0, eloReversed: 0, eloSkipped: 0, eloReinstated: 0 };

		const phaseOne = await this.runPhaseOne(gameId, request);
		if (phaseOne.outcome === "not-found") return { ...base, outcome: "not-found" };
		if (phaseOne.outcome === "conflict")
			return { ...base, outcome: "conflict", reason: phaseOne.reason };

		const annulled = phaseOne.outcome === "annulled";
		const pointsRows = annulled ? phaseOne.touchedKeys.length : 0;

		try {
			const { reversed, skipped } = await this.compensator.compensate(gameId);
			return {
				...base,
				outcome: annulled ? "annulled" : "already",
				pointsRows,
				eloReversed: reversed,
				eloSkipped: skipped,
			};
		} catch (error) {
			return { ...base, outcome: "partial", pointsRows, error: errorMessage(error) };
		}
	}

	// Only infrastructure failures throw out of phase 1 (business rejections
	// are values already). Nothing was committed, so this is reported as
	// "conflict" rather than aborting the rest of the batch.
	private async runPhaseOne(gameId: string, request: AnnulMatchesRequest): Promise<PhaseOneResult> {
		try {
			return await this.repository.annulPhaseOne({
				gameId,
				reason: request.reason,
				offenderUserId: request.offenderUserId,
				adminUserId: request.adminUserId,
			});
		} catch (error) {
			return { outcome: "conflict", reason: errorMessage(error) };
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
