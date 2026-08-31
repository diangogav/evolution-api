import { dataSource } from "../evolution-types/src/data-source";
import { AnnulledMatchRatingCompensator } from "../modules/rating/application/AnnulledMatchRatingCompensator";
import { RatingCompensationPostgresRepository } from "../modules/rating/infrastructure/RatingCompensationPostgresRepository";

// Reverses rating for every annulled match. Idempotent — safe to run on every deploy;
// matches already compensated are skipped via the rating_history UNIQUE(match_id, user_id, kind) guard.
async function main(): Promise<void> {
	await dataSource.initialize();

	try {
		const annulledMatches: { game_id: string }[] = await dataSource.query(
			"SELECT DISTINCT game_id FROM matches WHERE anulled = true",
		);

		const compensator = new AnnulledMatchRatingCompensator(
			new RatingCompensationPostgresRepository(),
		);

		let reversed = 0;
		let skipped = 0;

		for (const { game_id: matchId } of annulledMatches) {
			const result = await compensator.compensate(matchId);
			reversed += result.reversed;
			skipped += result.skipped;
		}

		console.log(
			`Rating compensation complete: ${annulledMatches.length} annulled matches checked, ${reversed} reversal rows written, ${skipped} already compensated`,
		);
	} finally {
		await dataSource.destroy();
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
