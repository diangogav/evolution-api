import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import {
	DuelReservation,
	generateReservationId,
	RESERVATION_TTL_SECONDS,
	ReservationStore,
} from "../../reserved-duel";
import { LightningEntry } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { lightningDuelReservation } from "../domain/LightningReservation";
import { LightningSummons, lightningSummons } from "../domain/LightningSummons";
import { LightningTournament } from "../domain/LightningTournament";
import { pairIdlePlayers } from "../domain/pairIdlePlayers";

/**
 * One pairing pass over a running tournament, under its row lock: idle players are paired
 * by score, each pair gets a game row and a reservation. The rows are written first and the
 * reservations published last, so a failed publish rolls the whole pass back and the next
 * tick retries; a reservation the server can see always has its game row committed. Returns
 * the reservations it issued, one summons per pair.
 */
export class PairLightningPlayers {
	constructor(
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly reservations: ReservationStore,
		private readonly newReservationId: () => string = () => generateReservationId(),
	) {}

	async pair(
		tournament: LightningTournament,
		manager: QueryableManager,
		now: Date,
	): Promise<LightningSummons[]> {
		const entries = await this.entries.listByTournament(tournament.id, manager);
		const byUser = new Map(entries.map((entry) => [entry.userId, entry]));
		const idle = entries.filter((entry) => entry.status === "active" && entry.presence === "idle");
		// A rematch is the only game left when nobody else can play: everyone else has left,
		// been removed or stepped away. Otherwise the pair waits for a new opponent.
		const playable = entries.filter(
			(entry) => entry.status === "active" && entry.presence !== "away",
		);
		const pairs = pairIdlePlayers(idle, { allowRematch: playable.length <= 2 });

		const issued: DuelReservation[] = [];
		const summons: LightningSummons[] = [];
		for (const { seat0, seat1 } of pairs) {
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
					round: null,
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
			summons.push(lightningSummons(tournament, reservationId, seat0, seat1));
		}
		for (const reservation of issued) {
			await this.reservations.issue(reservation, RESERVATION_TTL_SECONDS);
		}
		return summons;
	}
}

function paired(entry: LightningEntry, opponentId: string): LightningEntry {
	return { ...entry, presence: "paired", idleSince: null, lastOpponentId: opponentId };
}
