import { describe, expect, it } from "bun:test";

import {
	applyDuelToDoor,
	canRecoverDoor,
	canRollDie,
	DoorProgress,
	doorStatus,
	wonFirstTry,
} from "../../../../../src/modules/advent-calendar/domain/DoorProgress";

const NOW = new Date("2026-12-05T12:00:00Z");

function progress(overrides: Partial<DoorProgress> = {}): DoorProgress {
	return {
		userId: "user-1",
		calendarId: "advent-2026",
		day: 3,
		recoveredAt: null,
		clearedAt: null,
		attempts: 0,
		dieRoll: null,
		currentReservationId: null,
		...overrides,
	};
}

describe("doorStatus", () => {
	it("is locked while its day has not come", () => {
		expect(doorStatus(6, 5, null)).toBe("locked");
	});

	it("is open on its own day", () => {
		expect(doorStatus(5, 5, null)).toBe("open");
		expect(doorStatus(5, 5, progress({ day: 5, attempts: 2 }))).toBe("open");
	});

	it("is missed for a past day never cleared", () => {
		expect(doorStatus(3, 5, null)).toBe("missed");
		expect(doorStatus(3, 5, progress({ attempts: 1 }))).toBe("missed");
	});

	it("is open again once a past day is recovered", () => {
		expect(doorStatus(3, 5, progress({ recoveredAt: NOW }))).toBe("open");
	});

	it("is cleared once won, whatever the day", () => {
		expect(doorStatus(3, 5, progress({ clearedAt: NOW }))).toBe("cleared");
		expect(doorStatus(5, 5, progress({ day: 5, clearedAt: NOW }))).toBe("cleared");
	});
});

describe("canRecoverDoor", () => {
	it("allows a missed door only", () => {
		expect(canRecoverDoor(3, 5, null)).toBe(true);
		expect(canRecoverDoor(5, 5, null)).toBe(false);
		expect(canRecoverDoor(6, 5, null)).toBe(false);
		expect(canRecoverDoor(3, 5, progress({ recoveredAt: NOW }))).toBe(false);
		expect(canRecoverDoor(3, 5, progress({ clearedAt: NOW }))).toBe(false);
	});
});

describe("applyDuelToDoor", () => {
	it("clears the door on a win and counts the attempt", () => {
		const next = applyDuelToDoor(progress({ currentReservationId: "r1" }), "win", NOW);
		expect(next).toEqual(progress({ clearedAt: NOW, attempts: 1, currentReservationId: null }));
	});

	it("counts a loss and leaves the door playable", () => {
		const next = applyDuelToDoor(progress({ currentReservationId: "r1" }), "loss", NOW);
		expect(next).toEqual(progress({ attempts: 1, currentReservationId: null }));
	});

	it("counts a duel the player left before it started, so quitting is never free", () => {
		const next = applyDuelToDoor(progress({ currentReservationId: "r1" }), "player_void", NOW);
		expect(next.attempts).toBe(1);
		expect(next.clearedAt).toBeNull();
	});

	it("does not count an infrastructure failure", () => {
		for (const resolution of ["void", "stale_void"] as const) {
			const next = applyDuelToDoor(progress({ currentReservationId: "r1" }), resolution, NOW);
			expect(next).toEqual(progress());
		}
	});

	it("keeps the first clear when a second win arrives", () => {
		const first = new Date("2026-12-03T10:00:00Z");
		const next = applyDuelToDoor(
			progress({ clearedAt: first, attempts: 1, currentReservationId: "r2" }),
			"win",
			NOW,
		);
		expect(next.clearedAt).toEqual(first);
		expect(next.attempts).toBe(1);
		expect(next.currentReservationId).toBeNull();
	});
});

describe("wonFirstTry", () => {
	it("is true only for a door cleared on its first counted duel", () => {
		expect(wonFirstTry(progress({ clearedAt: NOW, attempts: 1 }))).toBe(true);
		expect(wonFirstTry(progress({ clearedAt: NOW, attempts: 2 }))).toBe(false);
		expect(wonFirstTry(progress({ attempts: 1 }))).toBe(false);
	});
});

describe("canRollDie", () => {
	it("allows one roll per cleared door", () => {
		expect(canRollDie(null)).toBe(false);
		expect(canRollDie(progress())).toBe(false);
		expect(canRollDie(progress({ clearedAt: NOW }))).toBe(true);
		expect(canRollDie(progress({ clearedAt: NOW, dieRoll: 4 }))).toBe(false);
	});
});
