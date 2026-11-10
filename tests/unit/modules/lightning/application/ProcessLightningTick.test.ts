import { describe, expect, it } from "bun:test";

import { ProcessLightningTick } from "../../../../../src/modules/lightning/application/ProcessLightningTick";
import {
	ALICE,
	BOB,
	CAROL,
	DAVE,
	decided,
	ENDS_AT,
	ERIN,
	REGISTRATION_AT,
	RUNNING_AT,
	STARTS_AT,
	TOURNAMENT_ID,
	World,
} from "./fakes";

function setup() {
	const world = new World();
	const tick = new ProcessLightningTick(
		world.unitOfWork,
		world.tournamentRepository,
		world.entryRepository,
		world.gameRepository,
		world.applyGame,
		world.pairPlayers,
		world.closeSwissRound,
		world.pairSwissRound,
		world.completeTournament,
		world.log,
	);
	return { world, tick };
}

const empty = {
	tournaments: 0,
	transitions: 0,
	applied: 0,
	stale: 0,
	paired: 0,
	completed: 0,
	removed: 0,
	failed: 0,
	skipped: false,
};

describe("ProcessLightningTick", () => {
	it("opens registration on the clock", async () => {
		const { world, tick } = setup();
		world.seedTournament({ status: "scheduled" });

		expect(await tick.run(new Date(REGISTRATION_AT.getTime() - 1))).toEqual({
			...empty,
			tournaments: 1,
		});
		expect(await tick.run(REGISTRATION_AT)).toMatchObject({ transitions: 1 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("registration");
	});

	it("starts the arena with enough players, sets everyone waiting and pairs them at once", async () => {
		const { world, tick } = setup();
		world.seedTournament({ status: "registration" });
		for (const user of [ALICE, BOB, CAROL, DAVE]) world.seedEntry(user);

		const result = await tick.run(STARTS_AT);

		expect(result).toMatchObject({ transitions: 1, paired: 2 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("running");
		expect(world.entry(ALICE)).toMatchObject({ presence: "paired" });
		expect(world.games.size).toBe(2);
		expect(world.redis.size).toBe(2);
	});

	it("cancels a tournament short of players at start", async () => {
		const { world, tick } = setup();
		world.seedTournament({ status: "registration" });
		world.seedEntry(ALICE);

		await tick.run(STARTS_AT);

		expect(world.tournaments.get(TOURNAMENT_ID)).toMatchObject({
			status: "cancelled",
			cancelledReason: "Not enough players",
		});
	});

	it("applies finished games and keeps the freed pair waiting for new opponents", async () => {
		const { world, tick } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const game = world.seedGame(ALICE, BOB);
		world.seedGame(CAROL, DAVE);
		world.record(game.reservationId, decided(0));

		const result = await tick.run(RUNNING_AT);

		expect(result).toMatchObject({ applied: 1, paired: 0 });
		expect(world.entry(ALICE)).toMatchObject({ score: 3, presence: "idle", lastOpponentId: BOB });
		expect(world.entry(BOB)).toMatchObject({ presence: "idle", lastOpponentId: ALICE });
	});

	it("pairs freed players across finished games in the same tick", async () => {
		const { world, tick } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const first = world.seedGame(ALICE, BOB);
		const second = world.seedGame(CAROL, DAVE);
		world.record(first.reservationId, decided(0));
		world.record(second.reservationId, decided(0));

		const result = await tick.run(RUNNING_AT);

		expect(result).toMatchObject({ applied: 2, paired: 2 });
		expect(world.entry(ALICE)?.lastOpponentId).not.toBe(BOB);
		expect(world.entry(CAROL)?.lastOpponentId).not.toBe(DAVE);
	});

	it("stops pairing at ends_at, finishes the live games and completes when none is left", async () => {
		const { world, tick } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const issuedAt = new Date(ENDS_AT.getTime() - 5 * 60_000);
		const game = world.seedGame(ALICE, BOB, { issuedAt });
		world.record(game.reservationId, { startedAt: issuedAt });

		expect(await tick.run(ENDS_AT)).toMatchObject({ transitions: 1, paired: 0, completed: 0 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("finishing");

		world.record(game.reservationId, decided(0));
		const after = new Date(ENDS_AT.getTime() + 60_000);
		expect(await tick.run(after)).toMatchObject({ applied: 1, completed: 1 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("completed");
		expect(world.results.map((r) => [r.position, r.userId])).toEqual([
			[1, ALICE],
			[2, BOB],
		]);
	});

	it("removes entries of players banned since they entered", async () => {
		const { world, tick } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		world.banned.add(DAVE);

		expect(await tick.run(RUNNING_AT)).toMatchObject({ removed: 1, paired: 1 });
		expect(world.entry(DAVE)?.status).toBe("removed");
	});

	it("skips the tick when another instance holds the lock", async () => {
		const { world, tick } = setup();
		world.lockHeld = true;
		world.seedTournament({ status: "scheduled" });

		expect(await tick.run(REGISTRATION_AT)).toEqual({ ...empty, skipped: true });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("scheduled");
	});

	it("rolls back a failing tournament, logs it and processes the others", async () => {
		const { world, tick } = setup();
		world.seedTournament({ status: "scheduled" });
		world.seedTournament({
			id: "other",
			status: "scheduled",
			registrationOpensAt: new Date(REGISTRATION_AT.getTime() + 1),
		});
		const update = world.tournamentRepository.update;
		world.tournamentRepository.update = async (tournament, manager) => {
			if (tournament.id === TOURNAMENT_ID) throw new Error("boom");
			return update(tournament, manager);
		};

		const result = await tick.run(new Date(REGISTRATION_AT.getTime() + 1));

		expect(result).toMatchObject({ tournaments: 2, transitions: 1, failed: 1 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("scheduled");
		expect(world.tournaments.get("other")?.status).toBe("registration");
		expect(world.log.error).toHaveBeenCalledTimes(1);
		expect(String(world.log.error.mock.calls[0][0])).toContain(TOURNAMENT_ID);
	});
});

describe("ProcessLightningTick — Swiss", () => {
	const minutes = (n: number) => new Date(STARTS_AT.getTime() + n * 60_000);

	it("starts with the round count fixed from the field, a re-estimated end and round one paired", async () => {
		const { world, tick } = setup();
		world.seedTournament({ system: "swiss", status: "registration" });
		for (const user of [ALICE, BOB, CAROL, DAVE, ERIN]) world.seedEntry(user);

		const result = await tick.run(STARTS_AT);

		expect(result).toMatchObject({ transitions: 1, paired: 2 });
		expect(world.tournaments.get(TOURNAMENT_ID)).toMatchObject({
			status: "running",
			rounds: 3,
			currentRound: 1,
			roundStartedAt: STARTS_AT,
			endsAt: minutes(3 * 41),
		});
		expect(world.byes).toHaveLength(1);
	});

	it("plays every round behind the barrier and completes when the last one closes", async () => {
		const { world, tick } = setup();
		world.seedTournament({ system: "swiss", status: "registration", rounds: 3 });
		for (const user of [ALICE, BOB, CAROL, DAVE]) world.seedEntry(user);
		const faced = new Set<string>();
		let clock = 0;

		await tick.run(minutes(clock));
		for (let round = 1; round <= 3; round++) {
			const live = [...world.games.values()].filter((g) => g.status === "pending");
			expect(live).toHaveLength(2);
			expect(live.every((g) => g.round === round)).toBe(true);
			for (const game of live) {
				const key = [game.seat0UserId, game.seat1UserId].sort().join("|");
				expect(faced.has(key)).toBe(false);
				faced.add(key);
			}

			// Half the round finished: nothing new is paired while the other table plays.
			world.record(live[1].reservationId, { startedAt: minutes(clock + 1) });
			world.record(live[0].reservationId, decided(0, minutes(clock + 10)));
			clock += 10;
			expect(await tick.run(minutes(clock))).toMatchObject({ applied: 1, paired: 0 });
			world.record(live[1].reservationId, decided(1, minutes(clock + 5)));
			clock += 5;
			await tick.run(minutes(clock));
			if (round < 3) {
				expect(world.tournaments.get(TOURNAMENT_ID)?.roundClosedAt).toEqual(minutes(clock));
				expect(await tick.run(minutes(clock + 0.5))).toMatchObject({ paired: 0 });
				clock += 1;
				expect(await tick.run(minutes(clock))).toMatchObject({ paired: 2 });
			}
		}

		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("completed");
		expect(world.results).toHaveLength(4);
		expect(world.results.reduce((sum, r) => sum + r.wins, 0)).toBe(6);
	});

	it("never ends a Swiss tournament on its estimated end while a round is live", async () => {
		const { world, tick } = setup();
		world.seedSwiss([ALICE, BOB], {
			currentRound: 1,
			roundStartedAt: minutes(0),
			roundMinutes: 120,
		});
		const game = world.seedGame(ALICE, BOB, { round: 1, issuedAt: minutes(0) });
		world.record(game.reservationId, { startedAt: minutes(1) });

		await tick.run(new Date(ENDS_AT.getTime() + 1));

		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("running");
	});

	it("closes unfinished tables as draws at the deadline and completes a field reduced to one", async () => {
		const { world, tick } = setup();
		world.seedSwiss([ALICE, BOB, CAROL], { currentRound: 1, roundStartedAt: minutes(0) });
		const game = world.seedGame(ALICE, BOB, { round: 1, issuedAt: minutes(0) });
		world.record(game.reservationId, { startedAt: minutes(1) });
		world.seedEntry(BOB, { status: "withdrawn", presence: "playing" });
		world.seedEntry(CAROL, { status: "withdrawn" });

		const result = await tick.run(minutes(40));

		expect(result).toMatchObject({ applied: 1, completed: 1 });
		expect(world.games.get(game.reservationId)).toMatchObject({ resolution: "draw" });
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("completed");
		expect(world.results.map((r) => [r.userId, r.score])).toEqual([
			[ALICE, 1],
			[BOB, 1],
		]);
	});

	it("keeps the round state when publishing the next round fails, and retries it next tick", async () => {
		const { world, tick } = setup();
		world.seedTournament({ system: "swiss", status: "registration" });
		for (const user of [ALICE, BOB, CAROL, DAVE]) world.seedEntry(user);
		const issue = world.store.issue;
		world.store.issue = async () => {
			throw new Error("redis down");
		};

		expect(await tick.run(STARTS_AT)).toMatchObject({ transitions: 1, failed: 1, paired: 0 });
		expect(world.tournaments.get(TOURNAMENT_ID)).toMatchObject({
			status: "running",
			currentRound: 0,
		});
		expect(world.games.size).toBe(0);

		world.store.issue = issue;
		expect(await tick.run(minutes(0.1))).toMatchObject({ paired: 2 });
		expect(world.tournaments.get(TOURNAMENT_ID)?.currentRound).toBe(1);
	});
});
