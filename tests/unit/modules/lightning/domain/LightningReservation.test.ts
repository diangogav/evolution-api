import { describe, expect, it } from "bun:test";

import {
	lightningDuelReservation,
	reservationSeat,
} from "../../../../../src/modules/lightning/domain/LightningReservation";

describe("lightningDuelReservation", () => {
	it("builds a single hidden reconnectable duel between two users with their registered decks and the arena's clocks", () => {
		const reservation = lightningDuelReservation({
			reservationId: "AbCdEfGh12345678",
			format: "tcg",
			seat0: { userId: "user-0", deck: { main: [1, 2], extra: [3], side: [4] } },
			seat1: { userId: "user-1", deck: { main: [5, 6], extra: [], side: [] } },
			lobbyTimeoutSeconds: 90,
			turnTimeSeconds: 120,
		});

		expect(reservation).toEqual({
			v: 1,
			reservationId: "AbCdEfGh12345678",
			format: "tcg",
			mode: "single",
			participants: [
				{
					seat: 0,
					kind: "user",
					userId: "user-0",
					requiredDeck: { main: [1, 2], extra: [3], side: [4] },
				},
				{
					seat: 1,
					kind: "user",
					userId: "user-1",
					requiredDeck: { main: [5, 6], extra: [], side: [] },
				},
			],
			options: {
				spectators: true,
				listed: false,
				reconnect: true,
				deckLock: "registered",
				lobbyTimeoutSeconds: 90,
				turnTimeSeconds: 120,
			},
			claim: null,
		});
	});

	it("seats a bot by its WindBot name with no deck and keeps the user's registered deck", () => {
		const reservation = lightningDuelReservation({
			reservationId: "AbCdEfGh12345678",
			format: "edison",
			seat0: reservationSeat({ userId: "user-0", deck: { main: [1], extra: [], side: [] } }),
			seat1: reservationSeat({
				userId: "bot-blackwing",
				deck: { main: [], extra: [], side: [] },
				botName: "Blackwing",
			}),
			lobbyTimeoutSeconds: 90,
			turnTimeSeconds: 120,
		});

		expect(reservation.participants).toEqual([
			{ seat: 0, kind: "user", userId: "user-0", requiredDeck: { main: [1], extra: [], side: [] } },
			{ seat: 1, kind: "windbot", botName: "Blackwing" },
		]);
	});
});
