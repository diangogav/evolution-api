import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Locale, localize, TransactionRunner } from "../../rewards";
import { AdventDie, calendarDay, isCalendarOpen, nextDoorAt } from "../domain/AdventCalendar";
import { AdventCatalogRepository } from "../domain/AdventCatalogRepository";
import { DoorProgress } from "../domain/DoorProgress";
import { DoorProgressRepository } from "../domain/DoorProgressRepository";
import { DoorView, toDoorView } from "./AdventCalendarView";
import { ApplyDoorDuel } from "./ApplyDoorDuel";

export type GetAdventCalendarInput = {
	userId: string;
	calendarId: string;
	locale: Locale;
	now: Date;
};

export type AdventCalendarView = {
	id: string;
	name: string;
	description: string;
	format: string;
	open: boolean;
	startsAt: string;
	endsAt: string;
	today: number;
	nextDoorAt: string | null;
	recoveryPrice: number;
	sealsBroken: number;
	decks: Array<{ id: string; name: string }>;
	die: AdventDie;
	doors: DoorView[];
};

// The calendar as one player sees it. Doors with a duel pending are locked and their
// finished results applied first, so a win shows as cleared on the very next read.
export class GetAdventCalendar {
	constructor(
		private readonly catalog: AdventCatalogRepository,
		private readonly doors: DoorProgressRepository,
		private readonly applyDuel: Pick<ApplyDoorDuel, "applyCurrent">,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: GetAdventCalendarInput): Promise<AdventCalendarView> {
		return this.transactions.run(async (manager) => {
			const calendar = await this.catalog.findById(input.calendarId, manager);
			if (!calendar) throw new NotFoundError(`Calendar "${input.calendarId}" not found`);

			const byDay = new Map<number, DoorProgress>();
			const live = new Set<number>();
			for (const row of await this.doors.listForUser(input.userId, calendar.id, manager)) {
				if (!row.currentReservationId) {
					byDay.set(row.day, row);
					continue;
				}
				const locked = await this.doors.lockDoor(input.userId, calendar.id, row.day, manager);
				const applied = await this.applyDuel.applyCurrent(locked, calendar, manager, input.now);
				byDay.set(row.day, applied.progress);
				if (applied.duelLive) live.add(row.day);
			}

			const today = calendarDay(calendar, input.now);
			const doors = calendar.doors.map((door) =>
				toDoorView(calendar, door, today, byDay.get(door.day) ?? null, live.has(door.day)),
			);
			return {
				id: calendar.id,
				name: localize(calendar.name, input.locale),
				description: localize(calendar.description, input.locale),
				format: calendar.format,
				open: isCalendarOpen(calendar, input.now),
				startsAt: calendar.startsAt.toISOString(),
				endsAt: calendar.endsAt.toISOString(),
				today,
				nextDoorAt: nextDoorAt(calendar, input.now)?.toISOString() ?? null,
				recoveryPrice: calendar.recoveryPrice,
				sealsBroken: doors.filter((door) => door.status === "cleared").length,
				decks: calendar.decks.map((deck) => ({
					id: deck.id,
					name: localize(deck.name, input.locale),
				})),
				die: calendar.die,
				doors,
			};
		});
	}
}
