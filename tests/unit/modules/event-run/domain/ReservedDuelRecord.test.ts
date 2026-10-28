import { describe, expect, it } from "bun:test";

import {
	ReservedDuelRecord,
	resolveDuelRecord,
	STALE_DUEL_MS,
} from "../../../../../src/modules/event-run/domain/ReservedDuelRecord";

const now = new Date("2026-10-31T20:00:00Z");
const earlier = new Date("2026-10-31T19:50:00Z");

function record(overrides: Partial<ReservedDuelRecord> = {}): ReservedDuelRecord {
	return {
		reservationId: "AbCdEfGh12345678",
		joinedAt: earlier,
		startedAt: earlier,
		endedAt: now,
		outcome: "decided",
		winnerSeat: 0,
		abandonedBySeat: null,
		reason: "win",
		...overrides,
	};
}

describe("resolveDuelRecord", () => {
	it("a decided duel won by seat 0 (the player) clears the wave", () => {
		expect(resolveDuelRecord(record({ winnerSeat: 0 }), now)).toBe("win");
	});

	it("a decided duel won by seat 1 (the bot) loses the run", () => {
		expect(resolveDuelRecord(record({ winnerSeat: 1 }), now)).toBe("loss");
	});

	it("a draw loses the run", () => {
		expect(resolveDuelRecord(record({ outcome: "draw", winnerSeat: null }), now)).toBe("loss");
	});

	it("leaving after the duel started loses the run (disconnect, room_closed)", () => {
		for (const reason of ["disconnect", "room_closed"]) {
			const abandoned = record({
				outcome: "abandoned",
				winnerSeat: null,
				abandonedBySeat: 0,
				reason,
			});
			expect(resolveDuelRecord(abandoned, now)).toBe("loss");
		}
	});

	it("leaving before the duel started is a counted player void (lobby leave, no_show)", () => {
		for (const reason of ["disconnect", "no_show"]) {
			const abandoned = record({
				outcome: "abandoned",
				winnerSeat: null,
				startedAt: null,
				abandonedBySeat: 0,
				reason,
			});
			expect(resolveDuelRecord(abandoned, now)).toBe("player_void");
		}
	});

	it("server_restart and bot_unavailable are free voids even after the duel started", () => {
		for (const reason of ["server_restart", "bot_unavailable"]) {
			const abandoned = record({
				outcome: "abandoned",
				winnerSeat: null,
				abandonedBySeat: null,
				reason,
			});
			expect(resolveDuelRecord(abandoned, now)).toBe("void");
		}
	});

	it("a pre-start abandon not caused by the player seat is a free void", () => {
		// The server records the bot leaving as bot_unavailable with no seat, and closes rooms
		// it could not play (room_closed, unplayable reservation) with no seat either.
		for (const reason of ["room_closed", "bot_unavailable", "server_restart", "unplayable"]) {
			const abandoned = record({
				outcome: "abandoned",
				winnerSeat: null,
				startedAt: null,
				abandonedBySeat: null,
				reason,
			});
			expect(resolveDuelRecord(abandoned, now)).toBe("void");
		}
	});

	it("an open row is live until it has been open for more than 2 hours, then stale", () => {
		const open = { endedAt: null, outcome: null, winnerSeat: null, reason: null };
		expect(resolveDuelRecord(record(open), now)).toBeNull();

		const joinedLongAgo = new Date(now.getTime() - STALE_DUEL_MS - 1);
		expect(resolveDuelRecord(record({ ...open, joinedAt: joinedLongAgo }), now)).toBe("stale_void");
		expect(
			resolveDuelRecord(record({ ...open, joinedAt: joinedLongAgo, startedAt: null }), now),
		).toBe("stale_void");
	});

	it("a decided row without a usable winner is a free void", () => {
		expect(resolveDuelRecord(record({ winnerSeat: null }), now)).toBe("void");
	});
});
