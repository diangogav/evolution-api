import { RatingCompensationRepository } from "../domain/RatingCompensationRepository";

export class AnnulledMatchRatingCompensator {
	constructor(private readonly repository: RatingCompensationRepository) {}

	async compensate(matchId: string): Promise<{ reversed: number; skipped: number }> {
		const appliedRows = await this.repository.findAppliedHistory(matchId);

		let reversed = 0;
		let skipped = 0;

		for (const row of appliedRows) {
			const reversalDelta = -row.delta;
			const applied = await this.repository.insertReversal(row, reversalDelta);

			if (applied) {
				reversed++;
			} else {
				skipped++;
			}
		}

		return { reversed, skipped };
	}
}
