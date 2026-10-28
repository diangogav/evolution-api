import { describe, expect, it } from "bun:test";

import {
	eventDuelReservation,
	generateReservationId,
	RESERVATION_ID_LENGTH,
	reservationPassword,
} from "../../../../../src/modules/event-run/domain/DuelReservation";

describe("generateReservationId", () => {
	it("returns 16 base62 characters and a password that fits the 20-character pass limit", () => {
		const id = generateReservationId();

		expect(id).toMatch(/^[0-9A-Za-z]{16}$/);
		expect(id).toHaveLength(RESERVATION_ID_LENGTH);
		expect(reservationPassword(id)).toBe(`rv#${id}`);
		expect(reservationPassword(id).length).toBeLessThanOrEqual(20);
	});

	it("drops bytes that would bias the alphabet", () => {
		let call = 0;
		const bytes = (length: number) => {
			call++;
			return new Uint8Array(length).fill(call === 1 ? 255 : 61);
		};

		expect(generateReservationId(bytes)).toBe("z".repeat(16));
	});
});

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
