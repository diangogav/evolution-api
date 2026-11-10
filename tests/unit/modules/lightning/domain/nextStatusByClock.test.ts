import { describe, expect, it } from "bun:test";

import { nextStatusByClock } from "../../../../../src/modules/lightning/domain/nextStatusByClock";

const registrationOpensAt = new Date("2026-11-10T19:00:00Z");
const startsAt = new Date("2026-11-10T20:00:00Z");
const endsAt = new Date("2026-11-10T21:00:00Z");

const at = (iso: string) => new Date(iso);

function next(
	status: Parameters<typeof nextStatusByClock>[0]["status"],
	now: Date,
	overrides: Partial<Parameters<typeof nextStatusByClock>[0]> = {},
) {
	return nextStatusByClock({
		status,
		registrationOpensAt,
		startsAt,
		endsAt,
		minPlayers: 4,
		activeEntries: 4,
		liveGames: 0,
		now,
		...overrides,
	});
}

describe("nextStatusByClock", () => {
	it("opens registration when its window starts and not before", () => {
		expect(next("scheduled", at("2026-11-10T18:59:59Z"))).toBe("scheduled");
		expect(next("scheduled", registrationOpensAt)).toBe("registration");
	});

	it("starts at starts_at with enough players and cancels otherwise", () => {
		expect(next("registration", at("2026-11-10T19:59:59Z"))).toBe("registration");
		expect(next("registration", startsAt)).toBe("running");
		expect(next("registration", startsAt, { activeEntries: 3 })).toBe("cancelled");
	});

	it("catches up several transitions in one tick", () => {
		expect(next("scheduled", startsAt)).toBe("running");
		expect(next("scheduled", startsAt, { activeEntries: 0 })).toBe("cancelled");
		expect(next("scheduled", endsAt)).toBe("completed");
		expect(next("scheduled", endsAt, { liveGames: 1 })).toBe("finishing");
	});

	it("stops pairing at ends_at and completes once no game is live", () => {
		expect(next("running", at("2026-11-10T20:59:59Z"))).toBe("running");
		expect(next("running", endsAt, { liveGames: 2 })).toBe("finishing");
		expect(next("finishing", at("2026-11-10T21:05:00Z"), { liveGames: 1 })).toBe("finishing");
		expect(next("finishing", at("2026-11-10T21:05:00Z"), { liveGames: 0 })).toBe("completed");
		expect(next("running", endsAt, { liveGames: 0 })).toBe("completed");
	});

	it("leaves terminal states alone", () => {
		expect(next("completed", at("2026-11-11T00:00:00Z"))).toBe("completed");
		expect(next("cancelled", at("2026-11-11T00:00:00Z"))).toBe("cancelled");
	});
});
