import { DuelReservation } from "../../reserved-duel";
import { LightningDeck } from "./LightningEntry";

export type ReservationSeat = { userId: string; deck: LightningDeck };

// One arena duel: two users with their registered decks, one game (a draw ends it),
// reconnectable so a dropped connection is not an instant loss, watchable from the
// tournament page but hidden from the public room list, with the arena's clocks.
export function lightningDuelReservation(input: {
	reservationId: string;
	format: string;
	seat0: ReservationSeat;
	seat1: ReservationSeat;
	lobbyTimeoutSeconds: number;
	turnTimeSeconds: number;
}): DuelReservation {
	const participant = (seat: number, player: ReservationSeat) => ({
		seat,
		kind: "user" as const,
		userId: player.userId,
		requiredDeck: {
			main: [...player.deck.main],
			extra: [...player.deck.extra],
			side: [...player.deck.side],
		},
	});
	return {
		v: 1,
		reservationId: input.reservationId,
		format: input.format,
		mode: "single",
		participants: [participant(0, input.seat0), participant(1, input.seat1)],
		options: {
			spectators: true,
			listed: false,
			reconnect: true,
			deckLock: "registered",
			lobbyTimeoutSeconds: input.lobbyTimeoutSeconds,
			turnTimeSeconds: input.turnTimeSeconds,
		},
		claim: null,
	};
}
