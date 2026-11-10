import { describe, expect, it } from "bun:test";

import { LightningGame } from "../../../../../src/modules/lightning/domain/LightningGame";
import {
	roundIsResolved,
	swissTables,
} from "../../../../../src/modules/lightning/domain/swissTables";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 20, minute));

function game(
	reservationId: string,
	seats: [string, string],
	status: LightningGame["status"],
	minute: number,
): LightningGame {
	return {
		reservationId,
		tournamentId: "t",
		seat0UserId: seats[0],
		seat1UserId: seats[1],
		issuedAt: at(minute),
		status,
		resolution: status === "applied" ? "draw" : status === "voided" ? "void" : null,
		reason: null,
		appliedAt: null,
		round: 2,
	};
}

describe("swissTables", () => {
	it("groups a table's re-issued reservations and keeps the latest one", () => {
		const tables = swissTables([
			game("R1", ["a", "b"], "voided", 0),
			game("R2", ["c", "d"], "pending", 0),
			game("R3", ["a", "b"], "pending", 3),
		]);

		expect(
			tables.map((t) => [t.seat0UserId, t.seat1UserId, t.latest.reservationId, t.state]),
		).toEqual([
			["a", "b", "R3", "live"],
			["c", "d", "R2", "live"],
		]);
	});

	it("tells a resolved table from one voided with nothing replacing it", () => {
		const tables = swissTables([
			game("R1", ["a", "b"], "voided", 0),
			game("R2", ["a", "b"], "applied", 4),
			game("R3", ["c", "d"], "voided", 0),
		]);

		expect(tables.map((t) => t.state)).toEqual(["resolved", "voided"]);
		expect(roundIsResolved(tables)).toBe(false);
		expect(roundIsResolved(tables.slice(0, 1))).toBe(true);
	});
});
