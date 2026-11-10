import { describe, expect, it } from "bun:test";

import { eventDuelReservation } from "../../../../../src/modules/event-run/domain/DuelReservation";

describe("eventDuelReservation", () => {
	it("builds the v1 contract: player at seat 0 with an exact deck, the wave bot at seat 1", () => {
		const reservation = eventDuelReservation({
			reservationId: "AbCdEfGh12345678",
			format: "edison",
			userId: "user-1",
			deck: { id: "necromancer", name: { en: "Necromancer" }, main: [1, 2], extra: [3] },
			botName: "Haunted",
		});

		expect(reservation).toEqual({
			v: 1,
			reservationId: "AbCdEfGh12345678",
			format: "edison",
			mode: "single",
			participants: [
				{
					seat: 0,
					kind: "user",
					userId: "user-1",
					requiredDeck: { main: [1, 2], extra: [3], side: [] },
				},
				{ seat: 1, kind: "windbot", botName: "Haunted" },
			],
			options: {
				spectators: false,
				listed: false,
				reconnect: false,
				deckLock: "exact",
				lobbyTimeoutSeconds: 120,
			},
			claim: null,
		});
	});
});
