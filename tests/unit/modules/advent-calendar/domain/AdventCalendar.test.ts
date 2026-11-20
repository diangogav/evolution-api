import { describe, expect, it } from "bun:test";

import {
	AdventCalendar,
	calendarDay,
	doorOf,
	isCalendarOpen,
	nextDoorAt,
} from "../../../../../src/modules/advent-calendar/domain/AdventCalendar";

function calendar(overrides: Partial<AdventCalendar> = {}): AdventCalendar {
	return {
		id: "advent-2026",
		name: { en: "Advent Village", es: "Aldea de Adviento" },
		description: { en: "Break the seals", es: "Rompe los sellos" },
		format: "goat",
		startsAt: new Date("2026-12-01T00:00:00Z"),
		endsAt: new Date("2027-01-01T00:00:00Z"),
		recoveryPrice: 50,
		doors: Array.from({ length: 24 }, (_, index) => ({
			day: index + 1,
			botName: `Sentinel${index + 1}`,
			prize: { essence: 50, cosmeticIds: [] },
		})),
		decks: [],
		die: { essence: [10, 20, 30, 40, 60], rare: { essence: 100, cosmeticIds: ["sleeve-frost"] } },
		...overrides,
	};
}

describe("calendarDay", () => {
	it("is 0 before the calendar starts", () => {
		expect(calendarDay(calendar(), new Date("2026-11-30T23:59:59Z"))).toBe(0);
	});

	it("is 1 from the first instant of the calendar", () => {
		expect(calendarDay(calendar(), new Date("2026-12-01T00:00:00Z"))).toBe(1);
	});

	it("changes at midnight UTC, not at the player's local midnight", () => {
		expect(calendarDay(calendar(), new Date("2026-12-05T23:59:59Z"))).toBe(5);
		expect(calendarDay(calendar(), new Date("2026-12-06T00:00:00Z"))).toBe(6);
	});

	it("keeps counting after the last door, so day 24 becomes a past day like any other", () => {
		expect(calendarDay(calendar(), new Date("2026-12-24T12:00:00Z"))).toBe(24);
		expect(calendarDay(calendar(), new Date("2026-12-25T00:00:00Z"))).toBe(25);
		expect(calendarDay(calendar(), new Date("2026-12-30T12:00:00Z"))).toBe(30);
	});
});

describe("isCalendarOpen", () => {
	it("includes the start and excludes the end", () => {
		expect(isCalendarOpen(calendar(), new Date("2026-11-30T23:59:59Z"))).toBe(false);
		expect(isCalendarOpen(calendar(), new Date("2026-12-01T00:00:00Z"))).toBe(true);
		expect(isCalendarOpen(calendar(), new Date("2026-12-31T23:59:59Z"))).toBe(true);
		expect(isCalendarOpen(calendar(), new Date("2027-01-01T00:00:00Z"))).toBe(false);
	});
});

describe("nextDoorAt", () => {
	it("is the calendar start before it begins", () => {
		expect(nextDoorAt(calendar(), new Date("2026-11-20T10:00:00Z"))).toEqual(
			new Date("2026-12-01T00:00:00Z"),
		);
	});

	it("is the next midnight UTC while doors remain", () => {
		expect(nextDoorAt(calendar(), new Date("2026-12-05T20:30:00Z"))).toEqual(
			new Date("2026-12-06T00:00:00Z"),
		);
	});

	it("is null once the last door is open, and stays null afterwards", () => {
		expect(nextDoorAt(calendar(), new Date("2026-12-24T00:00:00Z"))).toBeNull();
		expect(nextDoorAt(calendar(), new Date("2026-12-28T00:00:00Z"))).toBeNull();
	});
});

describe("doorOf", () => {
	it("finds a door by its day", () => {
		expect(doorOf(calendar(), 7)?.botName).toBe("Sentinel7");
	});

	it("is null for a day the calendar does not have", () => {
		expect(doorOf(calendar(), 0)).toBeNull();
		expect(doorOf(calendar(), 25)).toBeNull();
		expect(doorOf(calendar(), 2.5)).toBeNull();
	});
});
