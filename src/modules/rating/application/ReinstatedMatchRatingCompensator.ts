import { RatingCompensationRepository } from "../domain/RatingCompensationRepository";

export class ReinstatedMatchRatingCompensator {
	constructor(private readonly repository: RatingCompensationRepository) {}

	async reinstate(matchId: string): Promise<{ reinstated: number; skipped: number }> {
		const openReversals = await this.repository.findOpenReversals(matchId);

		let reinstated = 0;
		let skipped = 0;

		for (const row of openReversals) {
			// Negate the open reversal's own delta — same reasoning as
			// AnnulledMatchRatingCompensator negating an applied row; the floor
			// math happens inside the repository's locked transaction.
			const applied = await this.repository.insertReinstatement(row, -row.delta);

			if (applied) {
				reinstated++;
			} else {
				skipped++;
			}
		}

		return { reinstated, skipped };
	}
}
