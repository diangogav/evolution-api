import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { AssetUrlSigner, CosmeticRepository, CosmeticType } from "../../catalog";
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

export type AdventCosmeticView = {
	id: string;
	type: CosmeticType;
	name: string;
	assets: Record<string, string>;
	assetsExpiresAt?: string | null;
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
	/** Every cosmetic a door or the die can pay, once each, for clients to show by id. */
	cosmetics: AdventCosmeticView[];
};

// The calendar as one player sees it. Doors with a duel pending are locked and their
// finished results applied first, so a win shows as cleared on the very next read.
export class GetAdventCalendar {
	constructor(
		private readonly catalog: AdventCatalogRepository,
		private readonly doors: DoorProgressRepository,
		private readonly applyDuel: Pick<ApplyDoorDuel, "applyCurrent">,
		private readonly transactions: TransactionRunner,
		private readonly cosmetics: Pick<CosmeticRepository, "findById">,
		private readonly signer: Pick<AssetUrlSigner, "signManifest">,
	) {}

	async run(input: GetAdventCalendarInput): Promise<AdventCalendarView> {
		const view = await this.transactions.run((manager) => this.read(input, manager));
		// Described after the transaction: signing URLs must not hold the doors' row locks.
		const ids = [
			...new Set([
				...view.doors.flatMap((door) => door.prize.cosmeticIds),
				...view.die.rare.cosmeticIds,
			]),
		];
		const described = await Promise.all(ids.map((id) => this.describe(id)));
		return { ...view, cosmetics: described.flatMap((cosmetic) => cosmetic ?? []) };
	}

	// Prize cosmetics are described whatever their tier or the viewer's access: the point is
	// to show what a door can pay. An id the catalog no longer knows is left out here but
	// stays in the prize's `cosmeticIds`.
	private async describe(id: string): Promise<AdventCosmeticView | null> {
		const cosmetic = await this.cosmetics.findById(id);
		if (!cosmetic) return null;
		const manifest = await this.signer.signManifest(
			cosmetic.assetRef,
			cosmetic.assetFiles ?? undefined,
		);
		return {
			id: cosmetic.id,
			type: cosmetic.type,
			name: cosmetic.displayName,
			assets: manifest.assets,
			assetsExpiresAt: manifest.expiresAt,
		};
	}

	private async read(
		input: GetAdventCalendarInput,
		manager: QueryableManager,
	): Promise<Omit<AdventCalendarView, "cosmetics">> {
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
	}
}
