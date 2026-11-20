import { ApplyDoorDuel } from "../../../../../src/modules/advent-calendar/application/ApplyDoorDuel";
import { PayAdventPrize } from "../../../../../src/modules/advent-calendar/application/PayAdventPrize";
import { AdventCalendar } from "../../../../../src/modules/advent-calendar/domain/AdventCalendar";
import { AdventCatalogRepository } from "../../../../../src/modules/advent-calendar/domain/AdventCatalogRepository";
import {
	AdventDuelRepository,
	IssuedDoorReservation,
} from "../../../../../src/modules/advent-calendar/domain/AdventDuelRepository";
import { DoorProgress } from "../../../../../src/modules/advent-calendar/domain/DoorProgress";
import { DoorProgressRepository } from "../../../../../src/modules/advent-calendar/domain/DoorProgressRepository";
import { EntitlementSource } from "../../../../../src/modules/entitlements";
import { PickIndex } from "../../../../../src/modules/event-run";
import {
	DuelReservation,
	ReservationStore,
	ReservedDuelRecord,
	RevokeResult,
} from "../../../../../src/modules/reserved-duel";
import { EssenceLedgerRepository, TransactionRunner } from "../../../../../src/modules/rewards";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import type { QueryableManager } from "../../../../../src/shared/persistence/QueryableManager";

export const CALENDAR_ID = "advent-2026";
export const USER = "11111111-1111-4111-8111-111111111111";
// Day 5 of the calendar.
export const NOW = new Date("2026-12-05T12:00:00Z");
export const TODAY = 5;

export function advent(overrides: Partial<AdventCalendar> = {}): AdventCalendar {
	return {
		id: CALENDAR_ID,
		name: { en: "Advent Village", es: "Aldea de Adviento" },
		description: { en: "Break the seals", es: "Rompe los sellos" },
		format: "goat",
		startsAt: new Date("2026-12-01T00:00:00Z"),
		endsAt: new Date("2027-01-01T00:00:00Z"),
		recoveryPrice: 50,
		doors: Array.from({ length: 24 }, (_, index) => ({
			day: index + 1,
			botName: `Sentinel${index + 1}`,
			prize: { essence: 50, cosmeticIds: index + 1 === 5 ? ["sleeve-frost"] : [] },
		})),
		decks: [
			{ id: "chaos", name: { en: "Chaos", es: "Caos" }, main: [1, 2], extra: [3] },
			{ id: "warrior", name: { en: "Warrior", es: "Guerrero" }, main: [4], extra: [] },
		],
		die: { essence: [10, 20, 30, 40, 60], rare: { essence: 100, cosmeticIds: ["emote-rune"] } },
		...overrides,
	};
}

export function decided(winnerSeat: number, at = NOW): Partial<ReservedDuelRecord> {
	return { startedAt: at, endedAt: at, outcome: "decided", winnerSeat, reason: "win" };
}

const doorKey = (userId: string, calendarId: string, day: number) =>
	`${userId}|${calendarId}|${day}`;

// One in-memory database for every port, so the use cases are exercised together the way
// they share tables in production.
export class World {
	calendar = advent();
	doors = new Map<string, DoorProgress>();
	issued = new Map<string, IssuedDoorReservation>();
	records = new Map<string, ReservedDuelRecord>();
	applied = new Map<string, string>();
	redis = new Map<string, DuelReservation & { claimed?: boolean }>();
	ledger: EssenceLedgerEntry[] = [];
	granted: Array<{ userId: string; cosmeticId: string; source: EntitlementSource }> = [];
	events: string[] = [];
	private reservationSeq = 0;

	readonly manager: QueryableManager = { query: async () => [] };

	readonly catalog: AdventCatalogRepository = {
		findById: async (id) => (id === this.calendar.id ? this.calendar : null),
	};

	readonly doorRepository: DoorProgressRepository = {
		listForUser: async (userId, calendarId) =>
			[...this.doors.values()]
				.filter((door) => door.userId === userId && door.calendarId === calendarId)
				.map((door) => ({ ...door })),
		lockDoor: async (userId, calendarId, day) => {
			const key = doorKey(userId, calendarId, day);
			const existing = this.doors.get(key);
			if (existing) return { ...existing };
			const created = blankDoor(userId, calendarId, day);
			this.doors.set(key, created);
			return { ...created };
		},
		save: async (progress) => {
			this.events.push(`save:${progress.day}`);
			this.doors.set(doorKey(progress.userId, progress.calendarId, progress.day), { ...progress });
		},
	};

	readonly duelRepository: AdventDuelRepository = {
		recordReservation: async (reservation) => {
			this.issued.set(reservation.reservationId, { ...reservation });
		},
		findRecord: async (reservationId) => {
			const record = this.records.get(reservationId);
			return record ? { ...record } : null;
		},
		markApplied: async (reservationId, outcome) => {
			if (this.applied.has(reservationId)) return "skipped";
			this.applied.set(reservationId, outcome);
			return "inserted";
		},
	};

	readonly store: ReservationStore = {
		issue: async (reservation) => {
			this.events.push(`issue:${reservation.reservationId}`);
			this.redis.set(reservation.reservationId, { ...reservation });
		},
		revoke: async (id): Promise<RevokeResult> => {
			const key = this.redis.get(id);
			if (!key) return "gone";
			if (key.claimed) return "in_use";
			this.events.push(`revoke:${id}`);
			this.redis.delete(id);
			return "revoked";
		},
	};

	readonly ledgerRepository: EssenceLedgerRepository = {
		lockUser: async (userId) => {
			this.events.push(`lock:${userId}`);
		},
		append: async (entry) => {
			const duplicate = this.ledger.some(
				(e) =>
					e.userId === entry.userId &&
					e.kind === entry.kind &&
					e.referenceKey === entry.referenceKey,
			);
			if (duplicate) return "skipped";
			this.ledger.push(entry);
			return "inserted";
		},
		balanceOf: async (userId) =>
			this.ledger.filter((e) => e.userId === userId).reduce((sum, e) => sum + e.delta, 0),
	};

	activeCosmetics = new Set(["sleeve-frost", "emote-rune"]);
	readonly grantCosmetic = {
		runForUserId: async (input: {
			userId: string;
			cosmeticId: string;
			source: EntitlementSource;
		}) => {
			if (!this.activeCosmetics.has(input.cosmeticId)) {
				throw new NotFoundError(`Cosmetic "${input.cosmeticId}" not found`);
			}
			const created = !this.granted.some(
				(g) => g.userId === input.userId && g.cosmeticId === input.cosmeticId,
			);
			if (created) this.granted.push(input);
			return { ...input, created };
		},
	};

	readonly transactions: TransactionRunner = {
		run: async (work) => {
			const snapshot = this.snapshot();
			try {
				return await work(this.manager);
			} catch (error) {
				this.restore(snapshot);
				throw error;
			}
		},
	};

	// The die face a test wants, as the zero-based pick.
	pickIndex = 0;
	readonly pick: PickIndex = (size) => Math.min(this.pickIndex, size - 1);

	readonly payPrize = new PayAdventPrize(this.ledgerRepository, this.grantCosmetic);
	readonly applyDuel = new ApplyDoorDuel(this.doorRepository, this.duelRepository, this.payPrize);

	nextReservationId = (): string => `RSV${String(++this.reservationSeq).padStart(13, "0")}`;

	seedDoor(day: number, overrides: Partial<DoorProgress> = {}): DoorProgress {
		const door = { ...blankDoor(USER, CALENDAR_ID, day), ...overrides };
		this.doors.set(doorKey(USER, CALENDAR_ID, day), door);
		if (door.currentReservationId) {
			this.issued.set(door.currentReservationId, {
				reservationId: door.currentReservationId,
				userId: USER,
				calendarId: CALENDAR_ID,
				day,
				deckId: "chaos",
				issuedAt: NOW,
			});
		}
		return door;
	}

	door(day: number): DoorProgress | undefined {
		return this.doors.get(doorKey(USER, CALENDAR_ID, day));
	}

	credit(amount: number): void {
		this.ledger.push({
			userId: USER,
			kind: "mission",
			referenceKey: `seed:${amount}`,
			delta: amount,
		});
	}

	balance(): number {
		return this.ledger.filter((e) => e.userId === USER).reduce((sum, e) => sum + e.delta, 0);
	}

	// The duel server's side: claims the key, then writes its record.
	claim(reservationId: string): void {
		const key = this.redis.get(reservationId);
		if (key) key.claimed = true;
	}

	record(reservationId: string, overrides: Partial<ReservedDuelRecord> = {}): void {
		this.records.set(reservationId, {
			reservationId,
			roomId: null,
			joinedAt: NOW,
			startedAt: null,
			endedAt: null,
			outcome: null,
			winnerSeat: null,
			abandonedBySeat: null,
			reason: null,
			...overrides,
		});
	}

	private snapshot() {
		return {
			doors: new Map([...this.doors].map(([k, v]) => [k, { ...v }])),
			issued: new Map(this.issued),
			applied: new Map(this.applied),
			ledger: [...this.ledger],
			granted: [...this.granted],
		};
	}

	private restore(s: ReturnType<World["snapshot"]>): void {
		this.doors = s.doors;
		this.issued = s.issued;
		this.applied = s.applied;
		this.ledger = s.ledger;
		this.granted = s.granted;
	}
}

function blankDoor(userId: string, calendarId: string, day: number): DoorProgress {
	return {
		userId,
		calendarId,
		day,
		recoveredAt: null,
		clearedAt: null,
		attempts: 0,
		dieRoll: null,
		currentReservationId: null,
	};
}
