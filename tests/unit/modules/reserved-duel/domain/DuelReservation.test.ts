import { describe, expect, it } from "bun:test";

import {
	generateReservationId,
	RESERVATION_ID_LENGTH,
	reservationPassword,
} from "../../../../../src/modules/reserved-duel/domain/DuelReservation";

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
