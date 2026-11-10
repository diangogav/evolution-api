import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { essenceLedgerEntry, EssenceLedgerRepository } from "../../rewards";
import { computeStandings } from "../domain/computeStandings";
import { LightningEntry, qualifiesForStandings } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningResult, LightningResultRepository } from "../domain/LightningResultRepository";
import { LightningTournament, prizeForPosition } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";

export type CompleteOutcome = "completed" | "skipped";

export function essenceReferenceKey(tournamentId: string, userId: string): string {
	return `lightning:${tournamentId}:${userId}`;
}

/**
 * Freezes the standings and pays the prizes in the caller's transaction. The status
 * transition guards the writer: whoever moves `finishing` to `completed` writes results,
 * season points and essence; anyone else finds nothing to do. The ledger's unique movement
 * key makes a retried essence credit harmless on top of that.
 */
export class CompleteLightningTournament {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly results: LightningResultRepository,
		private readonly ledger: EssenceLedgerRepository,
	) {}

	async complete(
		tournament: LightningTournament,
		manager: QueryableManager,
		now: Date,
	): Promise<CompleteOutcome> {
		const moved = await this.tournaments.transitionStatus(
			tournament.id,
			"finishing",
			"completed",
			now,
			manager,
		);
		if (!moved) return "skipped";

		const entries = await this.entries.listByTournament(tournament.id, manager);
		const games = await this.games.listResolved(tournament.id, manager);
		const standings = computeStandings(
			entries.filter((entry) => qualifiesForStandings(entry, { final: true })),
			games,
			{ opponentScores: scoresOf(entries), system: tournament.system },
		);

		const results: LightningResult[] = standings.map((standing) => ({
			tournamentId: tournament.id,
			userId: standing.userId,
			position: standing.position,
			score: standing.score,
			wins: standing.wins,
			draws: standing.draws,
			losses: standing.losses,
			tiebreak: standing.tiebreak,
			pointsAwarded: prizeForPosition(tournament.pointsByPosition, standing.position),
			essenceAwarded: prizeForPosition(tournament.essenceByPosition, standing.position),
		}));
		await this.results.insertResults(results, manager);
		for (const result of results) {
			await this.results.addToRanking(
				result.userId,
				tournament.season,
				result.pointsAwarded,
				result.position === 1,
				manager,
			);
			if (result.essenceAwarded > 0) {
				await this.ledger.append(
					essenceLedgerEntry({
						userId: result.userId,
						kind: "lightning_tournament",
						referenceKey: essenceReferenceKey(tournament.id, result.userId),
						delta: result.essenceAwarded,
					}),
					manager,
				);
			}
		}
		return "completed";
	}
}

function scoresOf(entries: LightningEntry[]): Map<string, number> {
	return new Map(entries.map((entry) => [entry.userId, entry.score]));
}
