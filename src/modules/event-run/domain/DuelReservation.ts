import { EventDeck } from "./EventDefinition";
import { BOT_SEAT, PLAYER_SEAT } from "./ReservedDuelRecord";

// Contract 1 (shared with the duel server): `duel:reservation:<id>` holds this JSON. The
// password `rv#<id>` is 19 characters, inside the 20-character CTOS pass limit.
export const RESERVATION_ID_LENGTH = 16;
export const RESERVATION_TTL_SECONDS = 10 * 60;
export const RESERVATION_PASSWORD_PREFIX = "rv#";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// Largest multiple of 62 below 256: bytes at or above it are dropped so every character
// is equally likely.
const UNBIASED_BYTE_LIMIT = 248;

export type RandomBytes = (length: number) => Uint8Array;

const cryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function generateReservationId(randomBytes: RandomBytes = cryptoRandomBytes): string {
	let id = "";
	while (id.length < RESERVATION_ID_LENGTH) {
		for (const byte of randomBytes(RESERVATION_ID_LENGTH * 2)) {
			if (byte >= UNBIASED_BYTE_LIMIT) continue;
			id += BASE62[byte % 62];
			if (id.length === RESERVATION_ID_LENGTH) break;
		}
	}
	return id;
}

export function reservationPassword(reservationId: string): string {
	return `${RESERVATION_PASSWORD_PREFIX}${reservationId}`;
}

export type RequiredDeck = { main: number[]; extra: number[]; side: number[] };

export type ReservationParticipant =
	| { seat: number; kind: "user"; userId: string; requiredDeck?: RequiredDeck }
	| { seat: number; kind: "windbot"; botName: string };

export type DuelReservation = {
	v: 1;
	reservationId: string;
	format: string;
	mode: "single" | "match";
	participants: ReservationParticipant[];
	options: {
		spectators: boolean;
		listed: boolean;
		reconnect: boolean;
		deckLock: "exact" | "registered";
		lobbyTimeoutSeconds: number;
	};
	claim: null;
};

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
