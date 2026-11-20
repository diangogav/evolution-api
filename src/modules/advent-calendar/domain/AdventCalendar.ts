import { LocalizedText } from "../../rewards";

const DAY_MS = 86_400_000;

export type AdventPrize = {
	essence: number;
	cosmeticIds: string[];
};

// One door as stored in the catalog: the WindBot guarding it and what clearing it pays.
export type AdventDoor = {
	day: number;
	botName: string;
	prize: AdventPrize;
};

// The bonus die rolled after a door is cleared: `essence[n - 1]` is paid by faces 1 to 5,
// `rare` by a 6.
export type AdventDie = {
	essence: number[];
	rare: AdventPrize;
};

// One calendar as stored in the catalog. Door n opens n - 1 days after `startsAt`, so the
// start is expected at 00:00 UTC; the window may outlast the last door to leave time for
// recovering missed days.
export type AdventCalendar = {
	id: string;
	name: LocalizedText;
	description: LocalizedText;
	format: string;
	startsAt: Date;
	endsAt: Date;
	/** Essence a player pays to reopen one missed door. */
	recoveryPrice: number;
	doors: AdventDoor[];
	die: AdventDie;
};

export function isCalendarOpen(calendar: AdventCalendar, now: Date): boolean {
	return now.getTime() >= calendar.startsAt.getTime() && now.getTime() < calendar.endsAt.getTime();
}

// The latest door whose day has come: 0 before the calendar starts, then one more every
// 24 hours from `startsAt`, capped at the last door. Counted from the start instant rather
// than from each player's clock, so every player shares the same reset moment.
export function calendarDay(calendar: AdventCalendar, now: Date): number {
	const elapsed = now.getTime() - calendar.startsAt.getTime();
	if (elapsed < 0) return 0;
	return Math.min(Math.floor(elapsed / DAY_MS) + 1, calendar.doors.length);
}

// When the next door opens, for clients to count down to. Null once every door has opened.
export function nextDoorAt(calendar: AdventCalendar, now: Date): Date | null {
	const today = calendarDay(calendar, now);
	if (today >= calendar.doors.length) return null;
	return new Date(calendar.startsAt.getTime() + today * DAY_MS);
}

export function doorOf(calendar: AdventCalendar, day: number): AdventDoor | null {
	return calendar.doors.find((door) => door.day === day) ?? null;
}
