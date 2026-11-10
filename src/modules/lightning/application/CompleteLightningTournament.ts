import { Logger } from "../../../shared/logger/domain/Logger";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { achievementCredit, essenceLedgerEntry, EssenceLedgerRepository } from "../../rewards";
import { computeStandings, Standing } from "../domain/computeStandings";
import {
	CatalogLightningAchievement,
	LightningAchievementGrants,
} from "../domain/LightningAchievementGrants";
import {
	LIGHTNING_ACHIEVEMENT_CODES,
	lightningAchievements,
	UnlockedLightningAchievement,
} from "../domain/lightningAchievements";
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
 * season points, essence and achievements; anyone else finds nothing to do. The ledger's
 * unique movement key makes a retried essence credit harmless on top of that.
 *
 * Achievements are written to the shared `user_achievements` and their essence is credited
 * right after each insert, on the same transaction and under the very ledger key the
 * rewards worker uses, so an unlock and its essence commit together and the worker finds
 * nothing left to pay. A code missing from the catalog (its migration not run yet) is
 * skipped and logged: it must never keep a tournament from completing.
 */
export class CompleteLightningTournament {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly results: LightningResultRepository,
		private readonly ledger: EssenceLedgerRepository,
		private readonly achievements: LightningAchievementGrants,
		private readonly logger: Pick<Logger, "error">,
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

		// Nobody ranked, nothing to unlock: skip the catalog read and its missing-row alert.
		const catalog =
			standings.length > 0
				? await this.catalogFor(tournament, manager)
				: new Map<string, CatalogLightningAchievement>();
		const results: LightningResult[] = [];
		for (const standing of standings) {
			results.push({
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
				achievements: await this.unlock(tournament, standing, catalog, manager, now),
			});
		}
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

	private async catalogFor(
		tournament: LightningTournament,
		manager: QueryableManager,
	): Promise<Map<string, CatalogLightningAchievement>> {
		const rows = await this.achievements.findByCodes(LIGHTNING_ACHIEVEMENT_CODES, manager);
		const catalog = new Map(rows.map((row) => [row.code, row]));
		const missing = LIGHTNING_ACHIEVEMENT_CODES.filter((code) => !catalog.has(code));
		if (missing.length > 0) {
			this.logger.error(
				`Lightning tournament ${tournament.id} completed without achievements missing from the catalog: ${missing.join(", ")}`,
			);
		}
		return catalog;
	}

	// Held achievements are skipped in any season, as the duel server does: each one is
	// unlocked once per player.
	private async unlock(
		tournament: LightningTournament,
		standing: Standing,
		catalog: Map<string, CatalogLightningAchievement>,
		manager: QueryableManager,
		now: Date,
	): Promise<UnlockedLightningAchievement[]> {
		const priorWins =
			standing.position === 1
				? await this.results.countWins(standing.userId, tournament.id, manager)
				: 0;
		const earned = lightningAchievements({
			position: standing.position,
			losses: standing.losses,
			priorWins,
		}).flatMap((code) => catalog.get(code) ?? []);
		if (earned.length === 0) return [];

		await this.achievements.lockPlayer(standing.userId, manager);
		const held = await this.achievements.heldAchievementIds(
			standing.userId,
			earned.map((achievement) => achievement.id),
			manager,
		);
		const unlocked: UnlockedLightningAchievement[] = [];
		for (const achievement of earned) {
			if (held.has(achievement.id)) continue;
			const rowId = await this.achievements.grant(
				{
					userId: standing.userId,
					achievementId: achievement.id,
					season: tournament.season,
					unlockedAt: now,
				},
				manager,
			);
			const credit = achievementCredit({
				sourceId: rowId,
				userId: standing.userId,
				essenceReward: achievement.essenceReward,
			});
			if (credit) await this.ledger.append(credit, manager);
			unlocked.push({
				code: achievement.code,
				name: achievement.name,
				essenceReward: achievement.essenceReward,
			});
		}
		return unlocked;
	}
}

function scoresOf(entries: LightningEntry[]): Map<string, number> {
	return new Map(entries.map((entry) => [entry.userId, entry.score]));
}
