import { describe, expect, it, mock } from "bun:test";

import { LightningEntryPostgresRepository } from "../../../../../src/modules/lightning/infrastructure/LightningEntryPostgresRepository";
import { LightningGamePostgresRepository } from "../../../../../src/modules/lightning/infrastructure/LightningGamePostgresRepository";
import { LightningResultPostgresRepository } from "../../../../../src/modules/lightning/infrastructure/LightningResultPostgresRepository";
import { LightningTournamentPostgresRepository } from "../../../../../src/modules/lightning/infrastructure/LightningTournamentPostgresRepository";
import { PlayerDirectoryPostgresRepository } from "../../../../../src/modules/lightning/infrastructure/PlayerDirectoryPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

const at = (iso: string) => new Date(iso);

const tournamentRow = {
	id: "t-1",
	name: "Friday Lightning",
	format: "tcg",
	status: "running",
	season: 7,
	registration_opens_at: at("2026-11-10T19:00:00Z"),
	starts_at: at("2026-11-10T20:00:00Z"),
	ends_at: at("2026-11-10T21:00:00Z"),
	turn_time_seconds: 90,
	lobby_timeout_seconds: "90",
	min_players: 4,
	max_players: 64,
	points_by_position: { positions: [10, 7], others: 1 },
	essence_by_position: { positions: [], others: 0 },
	created_by: "admin-1",
	cancelled_reason: null,
	system: "arena",
	rounds: null,
	current_round: 0,
	round_minutes: 40,
	round_break_seconds: "60",
	round_started_at: null,
	round_closed_at: null,
	created_at: at("2026-11-10T18:00:00Z"),
	updated_at: at("2026-11-10T18:00:00Z"),
};

const tournament = {
	id: "t-1",
	name: "Friday Lightning",
	format: "tcg" as const,
	status: "running" as const,
	season: 7,
	registrationOpensAt: at("2026-11-10T19:00:00Z"),
	startsAt: at("2026-11-10T20:00:00Z"),
	endsAt: at("2026-11-10T21:00:00Z"),
	turnTimeSeconds: 90,
	lobbyTimeoutSeconds: 90,
	minPlayers: 4,
	maxPlayers: 64,
	pointsByPosition: { positions: [10, 7], others: 1 },
	essenceByPosition: { positions: [], others: 0 },
	createdBy: "admin-1",
	cancelledReason: null,
	system: "arena" as const,
	rounds: null,
	currentRound: 0,
	roundMinutes: 40,
	roundBreakSeconds: 60,
	roundStartedAt: null,
	roundClosedAt: null,
	createdAt: at("2026-11-10T18:00:00Z"),
	updatedAt: at("2026-11-10T18:00:00Z"),
};

describe("LightningTournamentPostgresRepository", () => {
	it("inserts the prize tables as jsonb and maps a locked row back", async () => {
		const manager = managerReturning([], [tournamentRow]);
		const repository = new LightningTournamentPostgresRepository();

		await repository.insert(tournament, manager);
		const locked = await repository.findByIdForUpdate("t-1", manager);

		const [insertSql, insertParams] = manager.query.mock.calls[0];
		expect(compact(insertSql)).toContain("INSERT INTO lightning_tournaments");
		expect(compact(insertSql)).toContain("$13::jsonb, $14::jsonb");
		expect(insertParams?.[12]).toBe(JSON.stringify({ positions: [10, 7], others: 1 }));
		expect(compact(manager.query.mock.calls[1][0])).toContain(
			"FROM lightning_tournaments WHERE id = $1 FOR UPDATE",
		);
		expect(locked).toEqual(tournament);
	});

	it("stores the Swiss settings and maps a Swiss round back", async () => {
		const swissRow = {
			...tournamentRow,
			system: "swiss",
			rounds: "4",
			current_round: "2",
			round_minutes: "30",
			round_break_seconds: 0,
			round_started_at: at("2026-11-10T20:31:00Z"),
			round_closed_at: at("2026-11-10T20:55:00Z"),
		};
		const manager = managerReturning([], [swissRow]);
		const repository = new LightningTournamentPostgresRepository();
		const swiss = {
			...tournament,
			system: "swiss" as const,
			rounds: 4,
			currentRound: 2,
			roundMinutes: 30,
			roundBreakSeconds: 0,
			roundStartedAt: at("2026-11-10T20:31:00Z"),
			roundClosedAt: at("2026-11-10T20:55:00Z"),
		};

		await repository.insert(swiss, manager);
		const found = await repository.findById("t-1", manager);

		const [insertSql, insertParams] = manager.query.mock.calls[0];
		expect(compact(insertSql)).toContain(
			"system, rounds, current_round, round_minutes, round_break_seconds, round_started_at, round_closed_at",
		);
		expect(insertParams?.slice(18)).toEqual([
			"swiss",
			4,
			2,
			30,
			0,
			swiss.roundStartedAt,
			swiss.roundClosedAt,
		]);
		expect(found).toEqual(swiss);
	});

	it("writes the round state, the fixed round count and the estimated end on update", async () => {
		const manager = managerReturning([]);
		const started = {
			...tournament,
			system: "swiss" as const,
			rounds: 3,
			currentRound: 1,
			roundStartedAt: at("2026-11-10T20:00:05Z"),
			endsAt: at("2026-11-10T22:03:00Z"),
		};

		await new LightningTournamentPostgresRepository().update(started, manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"SET status = $2, cancelled_reason = $3, updated_at = $4, ends_at = $5, rounds = $6, current_round = $7, round_started_at = $8, round_closed_at = $9 WHERE id = $1",
		);
		expect(params).toEqual([
			"t-1",
			"running",
			null,
			started.updatedAt,
			started.endsAt,
			3,
			1,
			started.roundStartedAt,
			null,
		]);
	});

	it("moves the status only from the expected one", async () => {
		const manager = managerReturning([[{ id: "t-1" }], 1], [[], 0]);
		const repository = new LightningTournamentPostgresRepository();
		const now = at("2026-11-10T21:05:00Z");

		expect(await repository.transitionStatus("t-1", "finishing", "completed", now, manager)).toBe(
			true,
		);
		expect(await repository.transitionStatus("t-1", "finishing", "completed", now, manager)).toBe(
			false,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("WHERE id = $1 AND status = $2 RETURNING id");
		expect(params).toEqual(["t-1", "finishing", "completed", now]);
	});

	it("lists by status with active entry counts, in the requested order", async () => {
		const manager = managerReturning([{ ...tournamentRow, entry_count: "3" }]);

		const listed = await new LightningTournamentPostgresRepository().list(
			{ statuses: ["completed"], newestFirst: true, limit: 50 },
			manager,
		);

		expect(listed).toEqual([{ tournament, entryCount: 3 }]);
		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("e.status = 'active'");
		expect(compact(sql)).toContain("WHERE t.status::text = ANY($1)");
		expect(compact(sql)).toContain("ORDER BY t.starts_at DESC, t.id LIMIT $2");
		expect(params).toEqual([["completed"], 50]);
	});

	it("lists open tournament ids oldest start first", async () => {
		const manager = managerReturning([{ id: "a" }, { id: "b" }]);

		expect(await new LightningTournamentPostgresRepository().listOpenIds(manager)).toEqual([
			"a",
			"b",
		]);
		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"WHERE status NOT IN ('completed', 'cancelled') ORDER BY starts_at, id",
		);
	});
});

const entryRow = {
	tournament_id: "t-1",
	user_id: "u-1",
	registered_at: at("2026-11-10T19:10:00Z"),
	status: "active",
	presence: "idle",
	deck: { main: [1, 2], extra: [3], side: [] },
	score: "6",
	wins: 2,
	draws: 0,
	losses: 1,
	games_played: 3,
	no_shows: 0,
	last_opponent_id: "u-2",
	idle_since: at("2026-11-10T20:20:00Z"),
};

const entry = {
	tournamentId: "t-1",
	userId: "u-1",
	registeredAt: at("2026-11-10T19:10:00Z"),
	status: "active" as const,
	presence: "idle" as const,
	deck: { main: [1, 2], extra: [3], side: [] },
	score: 6,
	wins: 2,
	draws: 0,
	losses: 1,
	gamesPlayed: 3,
	noShows: 0,
	lastOpponentId: "u-2",
	idleSince: at("2026-11-10T20:20:00Z"),
};

describe("LightningEntryPostgresRepository", () => {
	it("maps entries and writes the deck as jsonb", async () => {
		const manager = managerReturning([entryRow], [], []);
		const repository = new LightningEntryPostgresRepository();

		expect(await repository.listByTournament("t-1", manager)).toEqual([entry]);
		await repository.insert(entry, manager);
		await repository.update(entry, manager);

		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"FROM lightning_entries WHERE tournament_id = $1 ORDER BY registered_at, user_id",
		);
		const [insertSql, insertParams] = manager.query.mock.calls[1];
		expect(compact(insertSql)).toContain("$6::jsonb");
		expect(insertParams?.[5]).toBe(JSON.stringify(entry.deck));
		expect(compact(manager.query.mock.calls[2][0])).toContain(
			"WHERE tournament_id = $1 AND user_id = $2",
		);
	});

	it("starts the clock only for active players still idle", async () => {
		const manager = managerReturning([]);
		const now = at("2026-11-10T20:00:00Z");

		await new LightningEntryPostgresRepository().startWaiting("t-1", now, manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("SET idle_since = $2");
		expect(compact(sql)).toContain("status = 'active' AND presence = 'idle'");
		expect(params).toEqual(["t-1", now]);
	});

	it("removes active entries of users with an active ban", async () => {
		const manager = managerReturning([[{ user_id: "u-9" }], 1]);

		expect(await new LightningEntryPostgresRepository().removeBanned("t-1", manager)).toEqual([
			"u-9",
		]);
		const sql = compact(manager.query.mock.calls[0][0]);
		expect(sql).toContain("SET status = 'removed'");
		expect(sql).toContain("FROM user_bans AS b WHERE b.user_id = e.user_id");
		expect(sql).toContain("b.expires_at IS NULL OR b.expires_at > now()");
	});
});

describe("LightningGamePostgresRepository", () => {
	const gameRow = {
		reservation_id: "R1",
		tournament_id: "t-1",
		seat0_user_id: "u-1",
		seat1_user_id: "u-2",
		issued_at: at("2026-11-10T20:05:00Z"),
		status: "pending",
		resolution: null,
		reason: null,
		applied_at: null,
	};

	it("gates each game with a conditional update on pending", async () => {
		const manager = managerReturning([[{ reservation_id: "R1" }], 1], [[], 0]);
		const repository = new LightningGamePostgresRepository();
		const now = at("2026-11-10T20:20:00Z");

		expect(await repository.resolve("R1", "applied", "seat0_win", "win", now, manager)).toBe(
			"resolved",
		);
		expect(await repository.resolve("R1", "applied", "seat0_win", "win", now, manager)).toBe(
			"skipped",
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"WHERE reservation_id = $1 AND status = 'pending' RETURNING reservation_id",
		);
		expect(params).toEqual(["R1", "applied", "seat0_win", "win", now]);
	});

	it("finds a player's pending game on either seat and maps it", async () => {
		const manager = managerReturning([gameRow]);

		const game = await new LightningGamePostgresRepository().findPendingForUser(
			"t-1",
			"u-2",
			manager,
		);

		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"status = 'pending' AND (seat0_user_id = $2 OR seat1_user_id = $2)",
		);
		expect(game).toEqual({
			reservationId: "R1",
			tournamentId: "t-1",
			seat0UserId: "u-1",
			seat1UserId: "u-2",
			issuedAt: at("2026-11-10T20:05:00Z"),
			status: "pending",
			resolution: null,
			reason: null,
			appliedAt: null,
		});
	});

	it("lists pending games oldest first and resolved ones in apply order", async () => {
		const manager = managerReturning([], []);
		const repository = new LightningGamePostgresRepository();

		await repository.listPending("t-1", manager);
		await repository.listResolved("t-1", manager);

		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"status = 'pending' ORDER BY issued_at, reservation_id",
		);
		expect(compact(manager.query.mock.calls[1][0])).toContain(
			"status <> 'pending' ORDER BY applied_at, reservation_id",
		);
	});
});

describe("LightningResultPostgresRepository", () => {
	it("adds a tournament to the season row with one upsert", async () => {
		const manager = managerReturning([]);

		await new LightningResultPostgresRepository().addToRanking("u-1", 7, 10, true, manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain("ON CONFLICT (user_id, season) DO UPDATE SET");
		expect(compact(sql)).toContain("points = lightning_rankings.points + EXCLUDED.points");
		expect(compact(sql)).toContain(
			"tournaments_played = lightning_rankings.tournaments_played + 1",
		);
		expect(params).toEqual(["u-1", 7, 10, 1]);
	});

	it("writes one result row per player and reads the ranking with usernames", async () => {
		const manager = managerReturning(
			[],
			[
				{
					user_id: "u-1",
					username: "alice",
					season: 7,
					points: "17",
					tournaments_won: 1,
					tournaments_played: "2",
				},
			],
		);
		const repository = new LightningResultPostgresRepository();

		await repository.insertResults(
			[
				{
					tournamentId: "t-1",
					userId: "u-1",
					position: 1,
					score: 9,
					wins: 3,
					draws: 0,
					losses: 0,
					tiebreak: 4,
					pointsAwarded: 10,
					essenceAwarded: 0,
				},
			],
			manager,
		);
		const ranking = await repository.listRankings(7, 50, manager);

		expect(manager.query.mock.calls[0][1]).toEqual(["t-1", "u-1", 1, 9, 3, 0, 0, 4, 10, 0]);
		expect(compact(manager.query.mock.calls[1][0])).toContain(
			"JOIN users AS u ON u.id = r.user_id",
		);
		expect(compact(manager.query.mock.calls[1][0])).toContain("ORDER BY r.points DESC");
		expect(ranking).toEqual([
			{
				userId: "u-1",
				username: "alice",
				season: 7,
				points: 17,
				tournamentsWon: 1,
				tournamentsPlayed: 2,
			},
		]);
	});
});

describe("PlayerDirectoryPostgresRepository", () => {
	it("reads usernames for a list of ids and skips the query for none", async () => {
		const manager = managerReturning([{ id: "u-1", username: "alice" }]);
		const directory = new PlayerDirectoryPostgresRepository();

		expect(await directory.usernamesOf(["u-1", "u-2"], manager)).toEqual(
			new Map([["u-1", "alice"]]),
		);
		expect(await directory.usernamesOf([], manager)).toEqual(new Map());
		expect(manager.query).toHaveBeenCalledTimes(1);
		expect(manager.query.mock.calls[0][1]).toEqual([["u-1", "u-2"]]);
	});
});
