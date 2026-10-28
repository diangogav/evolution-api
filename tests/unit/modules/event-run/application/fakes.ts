import { ApplyReservedDuel } from "../../../../../src/modules/event-run/application/ApplyReservedDuel";
import { DuelReservation } from "../../../../../src/modules/event-run/domain/DuelReservation";
import { EventAttemptRepository } from "../../../../../src/modules/event-run/domain/EventAttemptRepository";
import { EventCatalogRepository } from "../../../../../src/modules/event-run/domain/EventCatalogRepository";
import { EventDefinition } from "../../../../../src/modules/event-run/domain/EventDefinition";
import { EventDuelRepository } from "../../../../../src/modules/event-run/domain/EventDuelRepository";
import { EventRun } from "../../../../../src/modules/event-run/domain/EventRun";
import { EventRunRepository } from "../../../../../src/modules/event-run/domain/EventRunRepository";
import { EventRunTickUnitOfWork } from "../../../../../src/modules/event-run/domain/EventRunTickUnitOfWork";
import { PickIndex } from "../../../../../src/modules/event-run/domain/WaveRival";
import {
	ReservationStore,
	RevokeResult,
} from "../../../../../src/modules/event-run/domain/ReservationStore";
import { ReservedDuelRecord } from "../../../../../src/modules/event-run/domain/ReservedDuelRecord";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import {
	EssenceLedgerRepository,
	QueryableManager,
} from "../../../../../src/modules/rewards/domain/EssenceLedgerRepository";
import { TransactionRunner } from "../../../../../src/modules/rewards/domain/TransactionRunner";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

export const EVENT_ID = "halloween-2026";
export const USER = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER = "22222222-2222-4222-8222-222222222222";
export const NOW = new Date("2026-10-31T20:00:00Z");

export function halloween(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return {
		id: EVENT_ID,
		name: { en: "Zombie Horde", es: "Horda Zombie" },
		description: { en: "Survive", es: "Sobrevive" },
		format: "edison",
		startsAt: new Date("2026-10-30T00:00:00Z"),
		endsAt: new Date("2026-11-09T00:00:00Z"),
		attemptsPerDay: 3,
		waves: halloweenWaves(),
		decks: [
			{
				id: "necromancer",
				name: { en: "Necromancer", es: "Nigromante" },
				main: [1, 2],
				extra: [3],
				botName: "Necromancer",
			},
		],
		prizeTiers: [
			{ wavesCleared: 3, essence: 150, cosmeticIds: ["sleeve-3"] },
			{ wavesCleared: 5, essence: 250, cosmeticIds: [] },
			{ wavesCleared: 8, essence: 400, cosmeticIds: [] },
		],
		...overrides,
	};
}

export const EASY = ["Haunted", "Skeletons", "Horde"];
export const MEDIUM = ["Archfiends", "Vampires", "Witches"];
export const HARD = ["DarkWorld", "CursedGarden", "Necromancer"];

export function halloweenWaves(): EventDefinition["waves"] {
	return [
		{ tier: "easy", pool: [...EASY] },
		{ tier: "easy", pool: [...EASY] },
		{ tier: "medium", pool: [...MEDIUM] },
		{ tier: "medium", pool: [...MEDIUM] },
		{ tier: "hard", pool: [...HARD] },
		{ tier: "hard", pool: [...HARD] },
		{ tier: "miniboss", pool: ["Lich"] },
		{ tier: "boss", pool: ["Gravekeepers"] },
	];
}

export function decided(winnerSeat: number, at = NOW): Partial<ReservedDuelRecord> {
	return { startedAt: at, endedAt: at, outcome: "decided", winnerSeat, reason: "win" };
}

// One in-memory database for every port, so use cases are exercised together the way
// they share tables in production. Every write is logged in order in `events`.
export class World {
	event = halloween();
	runs = new Map<string, EventRun>();
	attempts = new Map<string, number>();
	issuedReservations = new Map<string, { runId: string; wave: number; botName?: string }>();
	records = new Map<string, ReservedDuelRecord>();
	applied = new Map<string, { runId: string; outcome: string }>();
	redis = new Map<string, DuelReservation & { claimed?: boolean }>();
	ledger: EssenceLedgerEntry[] = [];
	granted: Array<{ userId: string; cosmeticId: string; source: EntitlementSource }> = [];
	events: string[] = [];
	lockHeld = false;
	private seq = 0;
	private reservationSeq = 0;

	readonly manager: QueryableManager = { query: async () => [] };

	readonly catalog: EventCatalogRepository = {
		findById: async (id) => (id === this.event.id ? this.event : null),
	};

	readonly runRepository: EventRunRepository = {
		lockUserEvent: async (userId, eventId) => {
			this.events.push(`lock:${userId}:${eventId}`);
		},
		findByIdForUpdate: async (id) => this.copy(this.runs.get(id)),
		findReadyForUpdate: async (userId, eventId) =>
			this.copy(
				[...this.runs.values()].find(
					(r) => r.userId === userId && r.eventId === eventId && r.status === "ready",
				),
			),
		findLatestForUpdate: async (userId, eventId) =>
			this.copy(
				[...this.runs.values()]
					.filter((r) => r.userId === userId && r.eventId === eventId)
					.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0],
			),
		insert: async (run) => {
			const ready = [...this.runs.values()].some(
				(r) => r.userId === run.userId && r.eventId === run.eventId && r.status === "ready",
			);
			if (ready && run.status === "ready") throw new Error("UQ_event_runs_one_ready violated");
			this.events.push(`insert:${run.id}`);
			this.runs.set(run.id, { ...run });
		},
		update: async (run) => {
			this.events.push(`update:${run.id}:${run.status}`);
			this.runs.set(run.id, { ...run });
		},
		bestMark: async (userId, eventId) =>
			Math.max(
				0,
				...[...this.runs.values()]
					.filter((r) => r.userId === userId && r.eventId === eventId)
					.map((r) => r.wavesCleared),
			),
		expireIdle: async (now, idleBefore) => {
			const expired: Array<{ runId: string; reservationId: string | null }> = [];
			for (const run of this.runs.values()) {
				if (run.status !== "ready") continue;
				const idle = run.updatedAt < idleBefore || this.event.endsAt <= now;
				const hasRecord = run.currentReservationId && this.records.has(run.currentReservationId);
				if (!idle || hasRecord) continue;
				this.runs.set(run.id, { ...run, status: "expired", currentReservationId: null });
				expired.push({ runId: run.id, reservationId: run.currentReservationId });
			}
			return expired;
		},
	};

	readonly attemptRepository: EventAttemptRepository = {
		consume: async (userId, eventId, periodKey, max) => {
			const key = `${userId}|${eventId}|${periodKey}`;
			const used = this.attempts.get(key) ?? 0;
			if (used >= max) return false;
			this.events.push(`attempt:${periodKey}`);
			this.attempts.set(key, used + 1);
			return true;
		},
		used: async (userId, eventId, periodKey) =>
			this.attempts.get(`${userId}|${eventId}|${periodKey}`) ?? 0,
	};

	readonly duelRepository: EventDuelRepository = {
		recordReservation: async (reservationId, runId, wave, botName) => {
			this.issuedReservations.set(reservationId, { runId, wave, botName });
		},
		runIdOf: async (reservationId) => this.issuedReservations.get(reservationId)?.runId ?? null,
		findRecord: async (reservationId) => {
			const record = this.records.get(reservationId);
			return record ? { ...record } : null;
		},
		markApplied: async (reservationId, runId, outcome) => {
			if (this.applied.has(reservationId)) return "skipped";
			this.events.push(`applied:${reservationId}:${outcome}`);
			this.applied.set(reservationId, { runId, outcome });
			return "inserted";
		},
		listPending: async (staleBefore, limit) =>
			[...this.issuedReservations.keys()]
				.filter((id) => !this.applied.has(id))
				.filter((id) => {
					const record = this.records.get(id);
					if (!record) return false;
					return (
						record.endedAt !== null || (record.joinedAt !== null && record.joinedAt < staleBefore)
					);
				})
				.slice(0, limit),
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
		lockUser: async () => undefined,
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

	activeCosmetics = new Set(["sleeve-3"]);
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

	readonly unitOfWork: EventRunTickUnitOfWork = {
		run: async (work) => (this.lockHeld ? undefined : work(this.manager)),
		savepoint: async (_manager, work) => {
			const snapshot = this.snapshot();
			try {
				return await work();
			} catch (error) {
				this.restore(snapshot);
				throw error;
			}
		},
	};

	// Deterministic draw: the first candidate unless a test sets another index.
	pickIndex = 0;
	readonly pick: PickIndex = (size) => Math.min(this.pickIndex, size - 1);

	readonly applyDuel = new ApplyReservedDuel(
		this.catalog,
		this.runRepository,
		this.duelRepository,
		this.ledgerRepository,
		this.grantCosmetic,
		this.pick,
	);

	nextRunId = (): string => `00000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`;
	nextReservationId = (): string => `RSV${String(++this.reservationSeq).padStart(13, "0")}`;

	// Seeds a run directly, as if earlier requests had built it.
	seedRun(overrides: Partial<EventRun> = {}): EventRun {
		const run: EventRun = {
			id: this.nextRunId(),
			userId: USER,
			eventId: EVENT_ID,
			deckId: "necromancer",
			status: "ready",
			currentWave: 1,
			wavesCleared: 0,
			currentBot: null,
			facedBots: [],
			currentReservationId: null,
			voids: 0,
			createdAt: NOW,
			updatedAt: NOW,
			...overrides,
		};
		this.runs.set(run.id, run);
		if (run.currentReservationId) {
			this.issuedReservations.set(run.currentReservationId, {
				runId: run.id,
				wave: run.currentWave,
			});
		}
		return run;
	}

	// The duel server's side: claims the key, then writes its record.
	claim(reservationId: string): void {
		const key = this.redis.get(reservationId);
		if (key) key.claimed = true;
	}

	record(reservationId: string, overrides: Partial<ReservedDuelRecord> = {}): void {
		this.records.set(reservationId, {
			reservationId,
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

	private copy(run: EventRun | undefined): EventRun | null {
		return run ? { ...run } : null;
	}

	private snapshot() {
		return {
			runs: new Map([...this.runs].map(([k, v]) => [k, { ...v }])),
			attempts: new Map(this.attempts),
			issued: new Map(this.issuedReservations),
			applied: new Map(this.applied),
			ledger: [...this.ledger],
		};
	}

	private restore(s: ReturnType<World["snapshot"]>): void {
		this.runs = s.runs;
		this.attempts = s.attempts;
		this.issuedReservations = s.issued;
		this.applied = s.applied;
		this.ledger = s.ledger;
	}
}
