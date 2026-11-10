import { DuelReservation } from "../../reserved-duel";
import { EventDeck } from "./EventDefinition";
import { BOT_SEAT, PLAYER_SEAT } from "./ReservedDuelRecord";

export const EVENT_LOBBY_TIMEOUT_SECONDS = 120;

// An event duel: the player at seat 0 with the run's deck locked exactly, the wave's bot
// at seat 1, one duel, hidden, and a disconnect ends the room (today's AI-room rule).
export function eventDuelReservation(input: {
	reservationId: string;
	format: string;
	userId: string;
	deck: EventDeck;
	botName: string;
}): DuelReservation {
	return {
		v: 1,
		reservationId: input.reservationId,
		format: input.format,
		mode: "single",
		participants: [
			{
				seat: PLAYER_SEAT,
				kind: "user",
				userId: input.userId,
				requiredDeck: { main: [...input.deck.main], extra: [...input.deck.extra], side: [] },
			},
			{ seat: BOT_SEAT, kind: "windbot", botName: input.botName },
		],
		options: {
			spectators: false,
			listed: false,
			reconnect: false,
			deckLock: "exact",
			lobbyTimeoutSeconds: EVENT_LOBBY_TIMEOUT_SECONDS,
		},
		claim: null,
	};
}
