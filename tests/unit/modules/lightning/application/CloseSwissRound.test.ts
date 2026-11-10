import { describe, expect, it } from "bun:test";

import { ALICE, BOB, CAROL, DAVE, decided, STARTS_AT, TOURNAMENT_ID, World } from "./fakes";

const minutes = (n: number) => new Date(STARTS_AT.getTime() + n * 60_000);

function liveRound(round = 1, rounds = 3) {
	const world = new World();
	const tournament = world.seedSwiss([ALICE, BOB, CAROL, DAVE], {
		rounds,
		currentRound: round,
		roundStartedAt: STARTS_AT,
	});
	const first = world.seedGame(ALICE, BOB, { round, issuedAt: STARTS_AT });
	const second = world.seedGame(CAROL, DAVE, { round, issuedAt: STARTS_AT });
	return { world, tournament, first, second };
}

const applied = { status: "applied" as const, resolution: "seat0_win" as const };

describe("CloseSwissRound", () => {
	it("keeps a round open while a table is still being played", async () => {
		const { world, tournament, first } = liveRound();
		world.games.set(first.reservationId, { ...first, ...applied });

		const result = await world.closeSwissRound.close(tournament, world.manager, minutes(20));

		expect(result).toEqual({ tournament, deadlineDraws: 0 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.roundClosedAt).toBeNull();
	});

	it("closes the round once every table has a result", async () => {
		const { world, tournament, first, second } = liveRound();
		world.games.set(first.reservationId, { ...first, ...applied });
		world.games.set(second.reservationId, { ...second, ...applied });

		const { tournament: closed } = await world.closeSwissRound.close(
			tournament,
			world.manager,
			minutes(25),
		);

		expect(closed).toMatchObject({ status: "running", roundClosedAt: minutes(25) });
		expect(world.tournaments.get(TOURNAMENT_ID)?.roundClosedAt).toEqual(minutes(25));
	});

	it("calls time at the deadline: unfinished tables are draws, their reservations revoked", async () => {
		const { world, tournament, first, second } = liveRound();
		world.games.set(first.reservationId, { ...first, ...applied });
		world.record(second.reservationId, { startedAt: minutes(2) });

		const result = await world.closeSwissRound.close(tournament, world.manager, minutes(40));

		expect(result.deadlineDraws).toBe(1);
		expect(result.tournament.roundClosedAt).toEqual(minutes(40));
		expect(world.games.get(second.reservationId)).toMatchObject({
			status: "applied",
			resolution: "draw",
			reason: "round_deadline",
		});
		expect(world.entry(CAROL)).toMatchObject({ score: 1, draws: 1, presence: "idle" });
		expect(world.entry(DAVE)).toMatchObject({ score: 1, draws: 1 });
		expect(world.redis.has(second.reservationId)).toBe(false);

		// The room finishing later changes nothing: the game already left pending.
		world.record(second.reservationId, decided(0, minutes(45)));
		const game = world.games.get(second.reservationId);
		expect(await world.applyGame.applyGame(game as never, world.manager, minutes(45))).toBe(
			"skipped",
		);
		expect(world.entry(CAROL)?.score).toBe(1);
	});

	it("records a draw for a voided table nothing replaced before the deadline", async () => {
		const { world, tournament, first, second } = liveRound();
		world.games.set(first.reservationId, { ...first, ...applied });
		world.games.set(second.reservationId, { ...second, status: "voided", resolution: "void" });

		await world.closeSwissRound.close(tournament, world.manager, minutes(41));

		const draws = [...world.games.values()].filter((g) => g.reason === "round_deadline");
		expect(draws).toHaveLength(1);
		expect(draws[0]).toMatchObject({
			seat0UserId: CAROL,
			seat1UserId: DAVE,
			round: 1,
			status: "applied",
			resolution: "draw",
			appliedAt: minutes(41),
		});
		expect(world.redis.has(draws[0].reservationId)).toBe(false);
		expect(world.entry(DAVE)?.score).toBe(1);
	});

	it("moves to finishing when the last round closes", async () => {
		const { world, tournament, first, second } = liveRound(3, 3);
		world.games.set(first.reservationId, { ...first, ...applied });
		world.games.set(second.reservationId, { ...second, ...applied });

		const { tournament: closed } = await world.closeSwissRound.close(
			tournament,
			world.manager,
			minutes(30),
		);

		expect(closed.status).toBe("finishing");
		expect(world.tournaments.get(TOURNAMENT_ID)).toMatchObject({
			status: "finishing",
			roundClosedAt: minutes(30),
		});
	});

	it("skips the remaining rounds once one active player is left between rounds", async () => {
		const world = new World();
		const tournament = world.seedSwiss([ALICE, BOB, CAROL], {
			currentRound: 1,
			roundStartedAt: STARTS_AT,
			roundClosedAt: minutes(20),
		});
		world.seedEntry(BOB, { status: "withdrawn" });
		world.seedEntry(CAROL, { status: "removed" });

		const { tournament: closed } = await world.closeSwissRound.close(
			tournament,
			world.manager,
			minutes(20.5),
		);

		expect(closed.status).toBe("finishing");
	});

	it("leaves a round live while two players remain, and leaves arenas alone", async () => {
		const { world, tournament } = liveRound();
		world.seedEntry(CAROL, { status: "withdrawn" });
		world.seedEntry(DAVE, { status: "withdrawn" });
		expect(
			(await world.closeSwissRound.close(tournament, world.manager, minutes(5))).tournament.status,
		).toBe("running");

		const arena = new World();
		const running = arena.seedRunning();
		expect(await arena.closeSwissRound.close(running, arena.manager, minutes(90))).toEqual({
			tournament: running,
			deadlineDraws: 0,
		});
	});
});
