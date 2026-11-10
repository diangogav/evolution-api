import { describe, expect, it } from "bun:test";

import { ProcessLightningTick } from "../../../../../src/modules/lightning/application/ProcessLightningTick";
import {
	ALICE,
	BOB,
	CAROL,
	DAVE,
	decided,
	ENDS_AT,
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

	it("applies finished games, then pairs the freed players", async () => {
		const { world, tick } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const game = world.seedGame(ALICE, BOB);
		world.seedGame(CAROL, DAVE);
		world.record(game.reservationId, decided(0));

		const result = await tick.run(RUNNING_AT);

		expect(result).toMatchObject({ applied: 1, paired: 1 });
		expect(world.entry(ALICE)).toMatchObject({ score: 3, presence: "paired", lastOpponentId: BOB });
		expect(world.entry(BOB)).toMatchObject({ presence: "paired", lastOpponentId: ALICE });
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
