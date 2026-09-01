import { RatingCompensationRepository } from "../domain/RatingCompensationRepository";

export class AnnulledMatchRatingCompensator {
	constructor(private readonly repository: RatingCompensationRepository) {}

	async compensate(matchId: string): Promise<{ reversed: number; skipped: number }> {
		const appliedRows = await this.repository.findAppliedHistory(matchId);

		let reversed = 0;
		let skipped = 0;

		for (const row of appliedRows) {
			// Undoing the applied row means asking for the exact opposite of the
			// delta it absorbed. How much of that the rating can take depends on
			// where the rating stands when the reversal is written, which is known
			// only inside the repository's locked transaction.
			const requestedDelta = -row.delta;
			const applied = await this.repository.insertReversal(row, requestedDelta);

			if (applied) {
				reversed++;
			} else {
				skipped++;
			}
		}

		return { reversed, skipped };
	}
}
