import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import {
	DuelReservation,
	generateReservationId,
	RESERVATION_TTL_SECONDS,
	ReservationStore,
} from "../../reserved-duel";
import { computeStandings } from "../domain/computeStandings";
import { LightningByeRepository } from "../domain/LightningByeRepository";
import { LightningEntry, recordBye } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { lightningDuelReservation } from "../domain/LightningReservation";
import { LightningTournament } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { pairSwissRound } from "../domain/pairSwissRound";
import { swissNextRoundAt } from "../domain/swissRounds";
import { swissTables } from "../domain/swissTables";

/**
 * The Swiss pairing pass, under the tournament row lock: round one at the start, each next
 * round once the previous one closed and its break is over, and in between a new
 * reservation for any table an infrastructure failure voided. Like the arena pass, rows are
 * written first and reservations published last, so a failed publish rolls the pass back
 * and the next tick pairs the same way (the round-one draw is seeded).
 */
export class PairSwissRound {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly byes: LightningByeRepository,
		private readonly reservations: ReservationStore,
		private readonly newReservationId: () => string = () => generateReservationId(),
	) {}

	async pair(
		tournament: LightningTournament,
		manager: QueryableManager,
		now: Date,
	): Promise<number> {
		if (tournament.system !== "swiss" || tournament.status !== "running") return 0;
		const entries = await this.entries.listByTournament(tournament.id, manager);
		const byUser = new Map(entries.map((entry) => [entry.userId, entry]));

		if (tournament.currentRound > 0 && tournament.roundClosedAt === null) {
			const games = await this.games.listByRound(tournament.id, tournament.currentRound, manager);
			const voided = swissTables(games).filter((table) => table.state === "voided");
			// The pair is the same even if a seat dropped since: an absent seat then loses by
			// no-show, which is the result the opponent is owed.
			return this.issue(
				tournament,
				voided.map((table) => [table.seat0UserId, table.seat1UserId]),
				byUser,
				manager,
				now,
			);
		}

		const nextRoundAt = swissNextRoundAt(tournament);
		const due = tournament.currentRound === 0 || (nextRoundAt !== null && now >= nextRoundAt);
		const nextRound = tournament.currentRound + 1;
		if (!due || nextRound > (tournament.rounds ?? 0)) return 0;
		const active = entries.filter((entry) => entry.status === "active");
		if (active.length < 2) return 0;

		const resolved = await this.games.listResolved(tournament.id, manager);
		const standings = computeStandings(active, resolved, {
			system: "swiss",
			opponentScores: new Map(entries.map((entry) => [entry.userId, entry.score])),
		});
		const byes = await this.byes.listByTournament(tournament.id, manager);
		const { pairs, bye } = pairSwissRound({
			players: standings.map((standing) => ({ userId: standing.userId, score: standing.score })),
			round: nextRound,
			seed: tournament.id,
			history: resolved
				.filter((game) => game.round !== null && game.status === "applied")
				.map((game) => [game.seat0UserId, game.seat1UserId] as const),
			hadBye: new Set(byes.map((granted) => granted.userId)),
		});

		const started: LightningTournament = {
			...tournament,
			currentRound: nextRound,
			roundStartedAt: now,
			roundClosedAt: null,
			updatedAt: now,
		};
		await this.tournaments.update(started, manager);
		if (bye) {
			await this.byes.insert(
				{ tournamentId: tournament.id, userId: bye, round: nextRound },
				manager,
			);
			await this.entries.update(recordBye(byUser.get(bye) as LightningEntry), manager);
		}
		return this.issue(
			started,
			pairs.map(({ seat0, seat1 }) => [seat0, seat1]),
			byUser,
			manager,
			now,
		);
	}

	private async issue(
		tournament: LightningTournament,
		pairs: Array<[string, string]>,
		byUser: Map<string, LightningEntry>,
		manager: QueryableManager,
		now: Date,
	): Promise<number> {
		const issued: DuelReservation[] = [];
		for (const [seat0, seat1] of pairs) {
			const first = byUser.get(seat0) as LightningEntry;
			const second = byUser.get(seat1) as LightningEntry;
			const reservationId = this.newReservationId();
			await this.games.insert(
				{
					reservationId,
					tournamentId: tournament.id,
					seat0UserId: seat0,
					seat1UserId: seat1,
					issuedAt: now,
					status: "pending",
					resolution: null,
					reason: null,
					appliedAt: null,
					round: tournament.currentRound,
				},
				manager,
			);
			await this.entries.update(paired(first, seat1), manager);
			await this.entries.update(paired(second, seat0), manager);
			issued.push(
				lightningDuelReservation({
					reservationId,
					format: tournament.format,
					seat0: { userId: seat0, deck: first.deck },
					seat1: { userId: seat1, deck: second.deck },
					lobbyTimeoutSeconds: tournament.lobbyTimeoutSeconds,
					turnTimeSeconds: tournament.turnTimeSeconds,
				}),
			);
		}
		for (const reservation of issued) {
			await this.reservations.issue(reservation, RESERVATION_TTL_SECONDS);
		}
		return pairs.length;
	}
}

function paired(entry: LightningEntry, opponentId: string): LightningEntry {
	return { ...entry, presence: "paired", idleSince: null, lastOpponentId: opponentId };
}
