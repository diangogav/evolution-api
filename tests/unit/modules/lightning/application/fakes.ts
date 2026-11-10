import { mock } from "bun:test";

import type { DeckValidation } from "../../../../../src/modules/community-decks";
import { ApplyLightningGame } from "../../../../../src/modules/lightning/application/ApplyLightningGame";
import { CloseSwissRound } from "../../../../../src/modules/lightning/application/CloseSwissRound";
import { CompleteLightningTournament } from "../../../../../src/modules/lightning/application/CompleteLightningTournament";
import { PairLightningPlayers } from "../../../../../src/modules/lightning/application/PairLightningPlayers";
import { PairSwissRound } from "../../../../../src/modules/lightning/application/PairSwissRound";
import {
	LightningBye,
	LightningByeRepository,
} from "../../../../../src/modules/lightning/domain/LightningByeRepository";
import { DeckLegalityChecker } from "../../../../../src/modules/lightning/domain/DeckLegalityChecker";
import {
	LightningEntry,
	newLightningEntry,
} from "../../../../../src/modules/lightning/domain/LightningEntry";
import { LightningEntryRepository } from "../../../../../src/modules/lightning/domain/LightningEntryRepository";
import { LightningGame } from "../../../../../src/modules/lightning/domain/LightningGame";
import { LightningGameRepository } from "../../../../../src/modules/lightning/domain/LightningGameRepository";
import {
	LightningResult,
	LightningResultRepository,
} from "../../../../../src/modules/lightning/domain/LightningResultRepository";
import { LightningTickUnitOfWork } from "../../../../../src/modules/lightning/domain/LightningTickUnitOfWork";
import {
	LightningTournament,
	lightningTournament,
	NewLightningTournament,
} from "../../../../../src/modules/lightning/domain/LightningTournament";
import { LightningTournamentRepository } from "../../../../../src/modules/lightning/domain/LightningTournamentRepository";
import { PlayerDirectory } from "../../../../../src/modules/lightning/domain/PlayerDirectory";
import type {
	DuelReservation,
	ReservationStore,
	ReservedDuelRecord,
	ReservedDuelRecordReader,
	RevokeResult,
} from "../../../../../src/modules/reserved-duel";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import {
	EssenceLedgerRepository,
	QueryableManager,
} from "../../../../../src/modules/rewards/domain/EssenceLedgerRepository";
import { TransactionRunner } from "../../../../../src/modules/rewards/domain/TransactionRunner";

export const TOURNAMENT_ID = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";
export const ADMIN = "00000000-0000-4000-8000-00000000admin";
export const USERS = ["alice", "bob", "carol", "dave", "erin", "frank"].map(
	(name) => `11111111-1111-4111-8111-${name.padEnd(12, "0")}`,
);
export const [ALICE, BOB, CAROL, DAVE, ERIN, FRANK] = USERS;
export const USERNAMES = new Map(
	["alice", "bob", "carol", "dave", "erin", "frank"].map((name, index) => [USERS[index], name]),
);

export const CREATED_AT = new Date("2026-11-10T18:00:00Z");
export const REGISTRATION_AT = new Date("2026-11-10T19:00:00Z");
export const STARTS_AT = new Date("2026-11-10T20:00:00Z");
export const ENDS_AT = new Date("2026-11-10T21:00:00Z");
export const RUNNING_AT = new Date("2026-11-10T20:10:00Z");
export const STALE_MS = 45 * 60 * 1000;

export const DECK = {
	main: Array.from({ length: 40 }, (_, i) => 1000 + i),
	extra: [5000],
	side: [],
};

export function logger() {
	return {
		debug: mock((_message: unknown) => undefined),
		info: mock((_message: unknown) => undefined),
		error: mock((_error: string | Error) => undefined),
	};
}

export function decided(winnerSeat: number, at = RUNNING_AT): Partial<ReservedDuelRecord> {
	return { startedAt: at, endedAt: at, outcome: "decided", winnerSeat, reason: "win" };
}

// One in-memory database for every port, so use cases are exercised together the way they
// share tables in production. Every write is logged in order in `events`.
export class World {
	tournaments = new Map<string, LightningTournament>();
	entries = new Map<string, LightningEntry>();
	games = new Map<string, LightningGame>();
	results: LightningResult[] = [];
	byes: LightningBye[] = [];
	rankings = new Map<
		string,
		{ userId: string; season: number; points: number; won: number; played: number }
	>();
	records = new Map<string, ReservedDuelRecord>();
	redis = new Map<string, DuelReservation & { claimed?: boolean }>();
	ledger: EssenceLedgerEntry[] = [];
	banned = new Set<string>();
	legal: DeckValidation = { legal: true };
	events: string[] = [];
	lockHeld = false;
	private reservationSeq = 0;

	readonly manager: QueryableManager = { query: async () => [] };

	readonly tournamentRepository: LightningTournamentRepository = {
		insert: async (tournament) => {
			this.events.push(`insert-tournament:${tournament.id}`);
			this.tournaments.set(tournament.id, { ...tournament });
		},
		findById: async (id) => this.copy(this.tournaments.get(id)),
		findByIdForUpdate: async (id) => {
			this.events.push(`lock:${id}`);
			return this.copy(this.tournaments.get(id));
		},
		update: async (tournament) => {
			this.events.push(`update-tournament:${tournament.id}:${tournament.status}`);
			this.tournaments.set(tournament.id, { ...tournament });
		},
		transitionStatus: async (id, from, to, now) => {
			const current = this.tournaments.get(id);
			if (!current || current.status !== from) return false;
			this.events.push(`transition:${id}:${from}->${to}`);
			this.tournaments.set(id, { ...current, status: to, updatedAt: now });
			return true;
		},
		list: async ({ statuses, newestFirst, limit }) =>
			[...this.tournaments.values()]
				.filter((t) => statuses.includes(t.status))
				.sort((a, b) => (a.startsAt.getTime() - b.startsAt.getTime()) * (newestFirst ? -1 : 1))
				.slice(0, limit)
				.map((tournament) => ({
					tournament: { ...tournament },
					entryCount: this.entriesOf(tournament.id).filter((e) => e.status === "active").length,
				})),
		listOpenIds: async () =>
			[...this.tournaments.values()]
				.filter((t) => t.status !== "completed" && t.status !== "cancelled")
				.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
				.map((t) => t.id),
	};

	readonly entryRepository: LightningEntryRepository = {
		insert: async (entry) => {
			const key = this.entryKey(entry.tournamentId, entry.userId);
			if (this.entries.has(key)) throw new Error("PK_lightning_entries violated");
			this.events.push(`insert-entry:${entry.userId}`);
			this.entries.set(key, { ...entry });
		},
		update: async (entry) => {
			this.events.push(`update-entry:${entry.userId}:${entry.status}:${entry.presence}`);
			this.entries.set(this.entryKey(entry.tournamentId, entry.userId), { ...entry });
		},
		findOne: async (tournamentId, userId) =>
			this.copy(this.entries.get(this.entryKey(tournamentId, userId))),
		listByTournament: async (tournamentId) => this.entriesOf(tournamentId).map((e) => ({ ...e })),
		startWaiting: async (tournamentId, now) => {
			this.events.push(`start-waiting:${tournamentId}`);
			for (const entry of this.entriesOf(tournamentId)) {
				if (entry.status !== "active" || entry.presence !== "idle") continue;
				this.entries.set(this.entryKey(tournamentId, entry.userId), { ...entry, idleSince: now });
			}
		},
		removeBanned: async (tournamentId) => {
			const removed: string[] = [];
			for (const entry of this.entriesOf(tournamentId)) {
				if (entry.status !== "active" || !this.banned.has(entry.userId)) continue;
				this.entries.set(this.entryKey(tournamentId, entry.userId), {
					...entry,
					status: "removed",
				});
				removed.push(entry.userId);
			}
			return removed;
		},
	};

	readonly gameRepository: LightningGameRepository = {
		insert: async (game) => {
			if (this.games.has(game.reservationId)) throw new Error("PK_lightning_games violated");
			this.events.push(`insert-game:${game.reservationId}`);
			this.games.set(game.reservationId, { ...game });
		},
		listPending: async (tournamentId) =>
			this.gamesOf(tournamentId)
				.filter((g) => g.status === "pending")
				.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime()),
		findPendingForUser: async (tournamentId, userId) =>
			this.copy(
				this.gamesOf(tournamentId).find(
					(g) => g.status === "pending" && (g.seat0UserId === userId || g.seat1UserId === userId),
				),
			),
		findLastResolvedForUser: async (tournamentId, userId) =>
			this.copy(
				this.gamesOf(tournamentId)
					.filter(
						(g) => g.status !== "pending" && (g.seat0UserId === userId || g.seat1UserId === userId),
					)
					.sort((a, b) => (b.appliedAt?.getTime() ?? 0) - (a.appliedAt?.getTime() ?? 0))[0],
			),
		resolve: async (reservationId, status, resolution, reason, appliedAt) => {
			const game = this.games.get(reservationId);
			if (!game || game.status !== "pending") return "skipped";
			this.events.push(`resolve-game:${reservationId}:${resolution}`);
			this.games.set(reservationId, { ...game, status, resolution, reason, appliedAt });
			return "resolved";
		},
		listByRound: async (tournamentId, round) =>
			this.gamesOf(tournamentId)
				.filter((g) => g.round === round)
				.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
				.map((g) => ({ ...g })),
		listResolved: async (tournamentId) =>
			this.gamesOf(tournamentId)
				.filter((g) => g.status !== "pending")
				.map((g) => ({ ...g })),
	};

	readonly byeRepository: LightningByeRepository = {
		insert: async (bye) => {
			if (
				this.byes.some(
					(b) =>
						b.tournamentId === bye.tournamentId && b.userId === bye.userId && b.round === bye.round,
				)
			) {
				throw new Error("PK_lightning_byes violated");
			}
			this.events.push(`insert-bye:${bye.userId}:${bye.round}`);
			this.byes.push({ ...bye });
		},
		listByTournament: async (tournamentId) =>
			this.byes.filter((b) => b.tournamentId === tournamentId).map((b) => ({ ...b })),
	};

	readonly resultRepository: LightningResultRepository = {
		insertResults: async (results) => {
			for (const result of results) {
				if (
					this.results.some(
						(r) => r.tournamentId === result.tournamentId && r.userId === result.userId,
					)
				) {
					throw new Error("PK_lightning_results violated");
				}
				this.events.push(`insert-result:${result.userId}:${result.position}`);
				this.results.push({ ...result });
			}
		},
		listResults: async (tournamentId) =>
			this.results.filter((r) => r.tournamentId === tournamentId).map((r) => ({ ...r })),
		addToRanking: async (userId, season, points, won) => {
			const key = `${userId}|${season}`;
			const row = this.rankings.get(key) ?? { userId, season, points: 0, won: 0, played: 0 };
			this.events.push(`rank:${userId}:+${points}`);
			this.rankings.set(key, {
				...row,
				points: row.points + points,
				won: row.won + (won ? 1 : 0),
				played: row.played + 1,
			});
		},
		listRankings: async (season, limit) =>
			[...this.rankings.values()]
				.filter((r) => r.season === season)
				.sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId))
				.slice(0, limit)
				.map((r) => ({
					userId: r.userId,
					username: USERNAMES.get(r.userId) ?? r.userId,
					season: r.season,
					points: r.points,
					tournamentsWon: r.won,
					tournamentsPlayed: r.played,
				})),
	};

	readonly recordReader: ReservedDuelRecordReader = {
		findRecords: async (ids) =>
			ids.flatMap((id) => {
				const record = this.records.get(id);
				return record ? [{ ...record }] : [];
			}),
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

	readonly players: PlayerDirectory = {
		usernamesOf: async (ids) =>
			new Map(ids.filter((id) => USERNAMES.has(id)).map((id) => [id, USERNAMES.get(id) as string])),
	};

	readonly legality: DeckLegalityChecker = { check: async () => this.legal };

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

	readonly unitOfWork: LightningTickUnitOfWork = {
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

	readonly log = logger();

	nextReservationId = (): string => `RSV${String(++this.reservationSeq).padStart(13, "0")}`;

	readonly applyGame = new ApplyLightningGame(
		this.entryRepository,
		this.gameRepository,
		this.recordReader,
		this.store,
		this.log,
		STALE_MS,
	);

	readonly pairPlayers = new PairLightningPlayers(
		this.entryRepository,
		this.gameRepository,
		this.store,
		this.nextReservationId,
	);

	readonly pairSwissRound = new PairSwissRound(
		this.tournamentRepository,
		this.entryRepository,
		this.gameRepository,
		this.byeRepository,
		this.store,
		this.nextReservationId,
	);

	readonly closeSwissRound = new CloseSwissRound(
		this.tournamentRepository,
		this.entryRepository,
		this.gameRepository,
		this.store,
		this.log,
		this.nextReservationId,
	);

	readonly completeTournament = new CompleteLightningTournament(
		this.tournamentRepository,
		this.entryRepository,
		this.gameRepository,
		this.resultRepository,
		this.ledgerRepository,
	);

	seedTournament(overrides: Partial<LightningTournament> & Partial<NewLightningTournament> = {}) {
		const base = lightningTournament({
			id: TOURNAMENT_ID,
			name: "Friday Lightning",
			format: "tcg",
			season: 7,
			registrationOpensAt: REGISTRATION_AT,
			startsAt: STARTS_AT,
			endsAt: ENDS_AT,
			createdBy: ADMIN,
			now: CREATED_AT,
			...overrides,
		});
		const tournament = { ...base, ...overrides } as LightningTournament;
		this.tournaments.set(tournament.id, tournament);
		return tournament;
	}

	/** A tournament in its play window with every seeded player idle since the start. */
	seedRunning(
		users: string[] = [ALICE, BOB, CAROL, DAVE],
		overrides: Partial<LightningEntry> = {},
	) {
		const tournament = this.seedTournament({ status: "running" });
		for (const userId of users) this.seedEntry(userId, { idleSince: STARTS_AT, ...overrides });
		return tournament;
	}

	/** A running Swiss tournament of three rounds, before round one, every player waiting. */
	seedSwiss(
		users: string[] = [ALICE, BOB, CAROL, DAVE],
		overrides: Partial<LightningTournament> = {},
	) {
		const tournament = this.seedTournament({
			system: "swiss",
			rounds: 3,
			status: "running",
			...overrides,
		});
		for (const userId of users) this.seedEntry(userId, { idleSince: STARTS_AT });
		return tournament;
	}

	seedEntry(userId: string, overrides: Partial<LightningEntry> = {}): LightningEntry {
		const entry = {
			...newLightningEntry({
				tournamentId: TOURNAMENT_ID,
				userId,
				deck: DECK,
				now: REGISTRATION_AT,
				running: false,
			}),
			...overrides,
		};
		this.entries.set(this.entryKey(entry.tournamentId, entry.userId), entry);
		return entry;
	}

	seedGame(seat0UserId: string, seat1UserId: string, overrides: Partial<LightningGame> = {}) {
		const game: LightningGame = {
			reservationId: this.nextReservationId(),
			tournamentId: TOURNAMENT_ID,
			seat0UserId,
			seat1UserId,
			issuedAt: RUNNING_AT,
			status: "pending",
			resolution: null,
			reason: null,
			appliedAt: null,
			round: null,
			...overrides,
		};
		this.games.set(game.reservationId, game);
		for (const [userId, opponent] of [
			[seat0UserId, seat1UserId],
			[seat1UserId, seat0UserId],
		]) {
			const entry = this.entries.get(this.entryKey(TOURNAMENT_ID, userId));
			if (entry) {
				this.entries.set(this.entryKey(TOURNAMENT_ID, userId), {
					...entry,
					presence: "paired",
					idleSince: null,
					lastOpponentId: opponent,
				});
			}
		}
		this.redis.set(game.reservationId, { reservationId: game.reservationId } as never);
		return game;
	}

	// The duel server's side: claims the key, then writes its record.
	claim(reservationId: string): void {
		const key = this.redis.get(reservationId);
		if (key) key.claimed = true;
	}

	record(reservationId: string, overrides: Partial<ReservedDuelRecord> = {}): void {
		this.records.set(reservationId, {
			reservationId,
			roomId: 42,
			joinedAt: RUNNING_AT,
			startedAt: null,
			endedAt: null,
			outcome: null,
			winnerSeat: null,
			abandonedBySeat: null,
			reason: null,
			...overrides,
		});
	}

	entry(userId: string, tournamentId = TOURNAMENT_ID): LightningEntry | undefined {
		return this.entries.get(this.entryKey(tournamentId, userId));
	}

	private entriesOf(tournamentId: string): LightningEntry[] {
		return [...this.entries.values()].filter((e) => e.tournamentId === tournamentId);
	}

	private gamesOf(tournamentId: string): LightningGame[] {
		return [...this.games.values()].filter((g) => g.tournamentId === tournamentId);
	}

	private entryKey(tournamentId: string, userId: string): string {
		return `${tournamentId}|${userId}`;
	}

	private copy<T extends object>(value: T | undefined): T | null {
		return value ? { ...value } : null;
	}

	private snapshot() {
		return {
			tournaments: new Map([...this.tournaments].map(([k, v]) => [k, { ...v }])),
			entries: new Map([...this.entries].map(([k, v]) => [k, { ...v }])),
			games: new Map([...this.games].map(([k, v]) => [k, { ...v }])),
			results: [...this.results],
			byes: [...this.byes],
			rankings: new Map([...this.rankings].map(([k, v]) => [k, { ...v }])),
			ledger: [...this.ledger],
		};
	}

	private restore(s: ReturnType<World["snapshot"]>): void {
		this.tournaments = s.tournaments;
		this.entries = s.entries;
		this.games = s.games;
		this.results = s.results;
		this.byes = s.byes;
		this.rankings = s.rankings;
		this.ledger = s.ledger;
	}
}
