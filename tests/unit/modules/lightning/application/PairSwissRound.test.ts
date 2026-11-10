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

		expect(await world.pairSwissRound.pair(tournament, world.manager, STARTS_AT)).toBe(2);

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

		expect(await world.pairSwissRound.pair(tournament, world.manager, later(59_999))).toBe(0);
		expect(await world.pairSwissRound.pair(tournament, world.manager, later(60_000))).toBe(2);

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

		expect(await world.pairSwissRound.pair(tournament, world.manager, later(1000))).toBe(1);

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
		expect(await world.pairSwissRound.pair(last, world.manager, later(3_600_000))).toBe(0);

		const alone = new World();
		const lonely = alone.seedSwiss([ALICE, BOB]);
		alone.seedEntry(BOB, { status: "withdrawn" });
		expect(await alone.pairSwissRound.pair(lonely, alone.manager, STARTS_AT)).toBe(0);

		const arena = new World();
		expect(await arena.pairSwissRound.pair(arena.seedRunning(), arena.manager, RUNNING_AT)).toBe(0);
		expect(arena.games.size).toBe(0);
	});
});
