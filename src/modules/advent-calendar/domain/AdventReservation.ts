import { BOT_SEAT, PLAYER_SEAT } from "../../event-run";
import { DuelReservation } from "../../reserved-duel";
import { AdventDeck } from "./AdventCalendar";

export const ADVENT_LOBBY_TIMEOUT_SECONDS = 120;

// A door duel: the player at seat 0 with the chosen event deck locked exactly, the door's
// sentinel at seat 1, one duel, hidden, and a disconnect ends the room. The seats are the
// ones `resolveDuelRecord` reads the winner from.
export function adventDuelReservation(input: {
	reservationId: string;
	format: string;
	userId: string;
	deck: AdventDeck;
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
			lobbyTimeoutSeconds: ADVENT_LOBBY_TIMEOUT_SECONDS,
		},
		claim: null,
	};
}
