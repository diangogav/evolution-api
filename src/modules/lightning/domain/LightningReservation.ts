import { DuelReservation } from "../../reserved-duel";
import { LightningDeck, LightningEntry } from "./LightningEntry";

export type ReservationSeat =
	| { kind?: "user"; userId: string; deck: LightningDeck }
	| { kind: "windbot"; botName: string };

/** The seat an entry takes: its registered deck, or the WindBot that plays it. */
export function reservationSeat(
	entry: Pick<LightningEntry, "userId" | "deck" | "botName">,
): ReservationSeat {
	return typeof entry.botName === "string"
		? { kind: "windbot", botName: entry.botName }
		: { userId: entry.userId, deck: entry.deck };
}

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
	// A WindBot plays its own list: the server requests it by name and never locks its deck.
	const participant = (seat: number, player: ReservationSeat) =>
		player.kind === "windbot"
			? { seat, kind: "windbot" as const, botName: player.botName }
			: {
					seat,
					kind: "user" as const,
					userId: player.userId,
					requiredDeck: {
						main: [...player.deck.main],
						extra: [...player.deck.extra],
						side: [...player.deck.side],
					},
				};
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
