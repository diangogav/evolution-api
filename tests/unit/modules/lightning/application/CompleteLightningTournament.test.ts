import { describe, expect, it } from "bun:test";

import { ALICE, BOB, CAROL, DAVE, ENDS_AT, ERIN, TOURNAMENT_ID, World } from "./fakes";

function finishedArena() {
	const world = new World();
	const tournament = world.seedTournament({
		status: "finishing",
		pointsByPosition: { positions: [10, 7], others: 1 },
		essenceByPosition: { positions: [100], others: 0 },
	});
	world.seedEntry(ALICE, { score: 6, wins: 2, gamesPlayed: 2 });
	world.seedEntry(BOB, { score: 3, wins: 1, losses: 1, gamesPlayed: 2 });
	world.seedEntry(CAROL, { score: 0, losses: 2, gamesPlayed: 2, status: "withdrawn" });
	// Registered, never played: not ranked. Removed players are never ranked either.
	world.seedEntry(DAVE);
	world.seedEntry(ERIN, { score: 3, wins: 1, gamesPlayed: 1, status: "removed" });
	const game = (seat0: string, seat1: string, resolution: "seat0_win" | "seat1_win") =>
		world.seedGame(seat0, seat1, { status: "applied", resolution, appliedAt: ENDS_AT });
	game(ALICE, BOB, "seat0_win");
	game(ALICE, CAROL, "seat0_win");
	game(BOB, CAROL, "seat0_win");
	return { world, tournament };
}

describe("CompleteLightningTournament", () => {
	it("writes results, season points and essence in one go and completes the tournament", async () => {
		const { world, tournament } = finishedArena();

		expect(await world.completeTournament.complete(tournament, world.manager, ENDS_AT)).toBe(
			"completed",
		);

		expect(
			world.results.map((r) => [r.position, r.userId, r.pointsAwarded, r.essenceAwarded]),
		).toEqual([
			[1, ALICE, 10, 100],
			[2, BOB, 7, 0],
			[3, CAROL, 1, 0],
		]);
		expect(world.results[1]).toMatchObject({ score: 3, wins: 1, losses: 1, tiebreak: 6 });
		expect([...world.rankings.values()]).toEqual([
			{ userId: ALICE, season: 7, points: 10, won: 1, played: 1 },
			{ userId: BOB, season: 7, points: 7, won: 0, played: 1 },
			{ userId: CAROL, season: 7, points: 1, won: 0, played: 1 },
		]);
		expect(world.ledger).toEqual([
			{
				userId: ALICE,
				kind: "lightning_tournament",
				referenceKey: `lightning:${TOURNAMENT_ID}:${ALICE}`,
				delta: 100,
			},
		]);
		expect(world.tournaments.get(TOURNAMENT_ID)?.status).toBe("completed");
	});

	it("does nothing when the tournament already left finishing", async () => {
		const { world, tournament } = finishedArena();
		world.tournaments.set(TOURNAMENT_ID, { ...tournament, status: "completed" });

		expect(await world.completeTournament.complete(tournament, world.manager, ENDS_AT)).toBe(
			"skipped",
		);
		expect(world.results).toEqual([]);
		expect(world.ledger).toEqual([]);
	});

	it("completes an arena nobody played without awards", async () => {
		const world = new World();
		const tournament = world.seedTournament({ status: "finishing" });
		world.seedEntry(ALICE);

		expect(await world.completeTournament.complete(tournament, world.manager, ENDS_AT)).toBe(
			"completed",
		);
		expect(world.results).toEqual([]);
		expect(world.rankings.size).toBe(0);
	});

	it("ranks a Swiss tournament by score, then Buchholz ahead of wins", async () => {
		const world = new World();
		const tournament = world.seedTournament({ system: "swiss", status: "finishing" });
		// BOB and CAROL tie on 3: BOB drew three times with the leader, CAROL beat the last one.
		world.seedEntry(ALICE, { score: 9, draws: 3, wins: 2, gamesPlayed: 5 });
		world.seedEntry(BOB, { score: 3, draws: 3, gamesPlayed: 3 });
		world.seedEntry(CAROL, { score: 3, wins: 1, gamesPlayed: 1 });
		world.seedEntry(DAVE, { score: 0, losses: 1, gamesPlayed: 1 });
		const applied = (seat0: string, seat1: string, resolution: "draw" | "seat0_win") =>
			world.seedGame(seat0, seat1, { status: "applied", resolution, round: 1, appliedAt: ENDS_AT });
		for (let i = 0; i < 3; i++) applied(BOB, ALICE, "draw");
		applied(CAROL, DAVE, "seat0_win");

		await world.completeTournament.complete(tournament, world.manager, ENDS_AT);

		expect(world.results.map((r) => [r.userId, r.tiebreak])).toEqual([
			[ALICE, 9],
			[BOB, 27],
			[CAROL, 0],
			[DAVE, 3],
		]);
	});
});
