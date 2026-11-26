import { describe, expect, it } from "bun:test";

import {
	ALICE,
	BOB,
	CAROL,
	DAVE,
	ERIN,
	RUNNING_AT,
	STARTS_AT,
	TOURNAMENT_ID,
	World,
	SALAMANGREAT,
	SKY_STRIKER,
	DECK,
} from "./fakes";

const later = (ms: number) => new Date(RUNNING_AT.getTime() + ms);
const pairs = (world: World, round: number) =>
	[...world.games.values()]
		.filter((g) => g.round === round)
		.map((g) => [g.seat0UserId, g.seat1UserId].sort().join("-"));

describe("PairSwissRound", () => {
	it("pairs round one from the seeded draw, scores the bye and publishes reservations last", async () => {
		const world = new World();
		const tournament = world.seedSwiss([ALICE, BOB, CAROL, DAVE, ERIN]);

		const summons = await world.pairSwissRound.pair(tournament, world.manager, STARTS_AT);

		expect(summons).toHaveLength(2);
		expect(world.tournaments.get(TOURNAMENT_ID)).toMatchObject({
			currentRound: 1,
			roundStartedAt: STARTS_AT,
			roundClosedAt: null,
		});
		const games = [...world.games.values()];
		expect(games.every((g) => g.round === 1 && g.status === "pending")).toBe(true);
		expect(world.byes).toHaveLength(1);
		const [{ userId: bye }] = world.byes;
		expect(world.entry(bye)).toMatchObject({ score: 3, wins: 1, gamesPlayed: 1, presence: "idle" });
		expect(summons.map((s) => [s.reservationId, ...s.userIds])).toEqual(
			games.map((g) => [g.reservationId, g.seat0UserId, g.seat1UserId]),
		);
		expect(summons[0]).toMatchObject({
			tournamentId: TOURNAMENT_ID,
			tournamentName: tournament.name,
			lobbyTimeoutSeconds: tournament.lobbyTimeoutSeconds,
		});
		for (const game of games) {
			expect(world.entry(game.seat0UserId)?.presence).toBe("paired");
			expect(world.redis.has(game.reservationId)).toBe(true);
		}
		const firstIssue = world.events.findIndex((e) => e.startsWith("issue:"));
		const lastWrite =
			world.events.length -
			1 -
			[...world.events].reverse().findIndex((e) => !e.startsWith("issue:"));
		expect(firstIssue).toBeGreaterThan(lastWrite);
	});

	it("pairs the same way when a failed pass is retried", async () => {
		const first = new World();
		const second = new World();
		for (const world of [first, second]) {
			const tournament = world.seedSwiss([ALICE, BOB, CAROL, DAVE, ERIN]);
			await world.pairSwissRound.pair(tournament, world.manager, STARTS_AT);
		}

		expect(pairs(second, 1)).toEqual(pairs(first, 1));
		expect(second.byes).toEqual(first.byes);
	});

	it("waits for the break, then pairs by standings without rematches", async () => {
		const world = new World();
		const closedAt = later(0);
		const tournament = world.seedSwiss([ALICE, BOB, CAROL, DAVE], {
			currentRound: 1,
			roundStartedAt: STARTS_AT,
			roundClosedAt: closedAt,
		});
		const result = (seat0: string, seat1: string) =>
			world.seedGame(seat0, seat1, { round: 1, status: "applied", resolution: "seat0_win" });
		result(ALICE, BOB);
		result(CAROL, DAVE);
		for (const [user, score] of [
			[ALICE, 3],
			[CAROL, 3],
			[BOB, 0],
			[DAVE, 0],
		] as const) {
			world.seedEntry(user, { score, presence: "idle", gamesPlayed: 1 });
		}

		expect(await world.pairSwissRound.pair(tournament, world.manager, later(59_999))).toHaveLength(
			0,
		);
		expect(await world.pairSwissRound.pair(tournament, world.manager, later(60_000))).toHaveLength(
			2,
		);

		expect(pairs(world, 2)).toEqual([
			[ALICE, CAROL].sort().join("-"),
			[BOB, DAVE].sort().join("-"),
		]);
		expect(world.tournaments.get(TOURNAMENT_ID)).toMatchObject({
			currentRound: 2,
			roundStartedAt: later(60_000),
			roundClosedAt: null,
		});
		expect(world.byes).toEqual([]);
	});

	it("re-issues a voided table of the live round to the same pair, leaving live tables alone", async () => {
		const world = new World();
		const tournament = world.seedSwiss([ALICE, BOB, CAROL, DAVE], {
			currentRound: 1,
			roundStartedAt: STARTS_AT,
		});
		const voided = world.seedGame(ALICE, BOB, { round: 1, status: "voided", resolution: "void" });
		world.seedGame(CAROL, DAVE, { round: 1 });
		world.seedEntry(ALICE, { presence: "idle" });
		world.seedEntry(BOB, { presence: "idle" });

		expect(await world.pairSwissRound.pair(tournament, world.manager, later(1000))).toHaveLength(1);

		const reissued = [...world.games.values()].filter(
			(g) => g.round === 1 && g.status === "pending" && g.seat0UserId === ALICE,
		);
		expect(reissued).toHaveLength(1);
		expect(reissued[0]).toMatchObject({ seat1UserId: BOB, issuedAt: later(1000) });
		expect(reissued[0].reservationId).not.toBe(voided.reservationId);
		expect(world.entry(ALICE)?.presence).toBe("paired");
		expect(world.tournaments.get(TOURNAMENT_ID)?.currentRound).toBe(1);
	});

	it("pairs nothing after the last round, with one player left, or for an arena", async () => {
		const world = new World();
		const last = world.seedSwiss([ALICE, BOB], {
			currentRound: 3,
			roundStartedAt: STARTS_AT,
			roundClosedAt: STARTS_AT,
		});
		expect(await world.pairSwissRound.pair(last, world.manager, later(3_600_000))).toHaveLength(0);

		const alone = new World();
		const lonely = alone.seedSwiss([ALICE, BOB]);
		alone.seedEntry(BOB, { status: "withdrawn" });
		expect(await alone.pairSwissRound.pair(lonely, alone.manager, STARTS_AT)).toHaveLength(0);

		const arena = new World();
		expect(
			await arena.pairSwissRound.pair(arena.seedRunning(), arena.manager, RUNNING_AT),
		).toHaveLength(0);
		expect(arena.games.size).toBe(0);
	});
});

describe("PairSwissRound with bots", () => {
	it("seats bots as WindBots, announces a table of two bots and calls only humans", async () => {
		const world = new World();
		const tournament = world.seedSwiss([ALICE, BOB]);
		world.seedBot(SALAMANGREAT, { idleSince: STARTS_AT });
		world.seedBot(SKY_STRIKER, { idleSince: STARTS_AT });

		const summons = await world.pairSwissRound.pair(tournament, world.manager, STARTS_AT);

		const reservations = [...world.games.values()].map((game) =>
			world.redis.get(game.reservationId),
		);
		const kinds = reservations.map((reservation) =>
			reservation?.participants.map((participant) => participant.kind).join("+"),
		);
		expect(kinds).toHaveLength(2);
		for (const reservation of reservations) {
			for (const participant of reservation?.participants ?? []) {
				if (participant.kind === "user") expect(participant.requiredDeck).toEqual(DECK);
			}
			const botOnly = reservation?.participants.every((p) => p.kind === "windbot");
			expect(world.events.includes(`announce:${reservation?.reservationId}`)).toBe(
				botOnly === true,
			);
		}
		const called = summons.flatMap((s) => s.userIds);
		expect(called.length).toBeGreaterThan(0);
		expect(called.every((user) => user === ALICE || user === BOB)).toBe(true);
	});

	it("issues a table again when the server never opened its duel between bots", async () => {
		const world = new World();
		const tournament = world.seedSwiss([ALICE, BOB], {
			currentRound: 1,
			roundStartedAt: STARTS_AT,
		});
		world.seedBot(SALAMANGREAT);
		world.seedBot(SKY_STRIKER);
		const game = world.seedGame(SALAMANGREAT, SKY_STRIKER, { round: 1, issuedAt: STARTS_AT });

		await world.applyGame.applyGame(game, world.manager, later(10 * 60_000));
		const summons = await world.pairSwissRound.pair(
			world.tournaments.get(TOURNAMENT_ID) as typeof tournament,
			world.manager,
			later(10 * 60_000),
		);

		expect(world.games.get(game.reservationId)).toMatchObject({
			status: "voided",
			resolution: "void",
		});
		expect(world.entry(SALAMANGREAT)).toMatchObject({ noShows: 0, losses: 0, status: "active" });
		const reissued = [...world.games.values()].filter(
			(candidate) => candidate.round === 1 && candidate.status === "pending",
		);
		expect(reissued.map((g) => [g.seat0UserId, g.seat1UserId])).toEqual([
			[SALAMANGREAT, SKY_STRIKER],
		]);
		expect(world.events).toContain(`announce:${reissued[0].reservationId}`);
		expect(summons).toEqual([]);
	});
});
