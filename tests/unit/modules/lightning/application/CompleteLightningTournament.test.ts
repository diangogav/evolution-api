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

	it("unlocks each ranked player's lightning achievements and keeps them on the result", async () => {
		const { world, tournament } = finishedArena();

		await world.completeTournament.complete(tournament, world.manager, ENDS_AT);

		expect(world.unlocks.map((u) => [u.userId, u.achievementId])).toEqual([
			[ALICE, 1101],
			[ALICE, 1102],
			[ALICE, 1103],
			[ALICE, 1104],
			[BOB, 1101],
			[BOB, 1102],
			[CAROL, 1101],
			[CAROL, 1102],
		]);
		for (const unlock of world.unlocks) {
			expect(unlock).toMatchObject({ season: 7, unlockedAt: ENDS_AT });
		}
		expect(world.results[1].achievements).toEqual([
			{ code: "LIGHTNING_FIRST", name: "First lightning", essenceReward: 50 },
			{ code: "LIGHTNING_PODIUM", name: "Podium", essenceReward: 100 },
		]);
		expect(world.events).toContain(`lock-achievements:${ALICE}`);
		expect(world.log.error).not.toHaveBeenCalled();
	});

	it("never unlocks an achievement twice, whatever season the player got it in", async () => {
		const { world, tournament } = finishedArena();
		world.unlocks.push({
			userId: ALICE,
			achievementId: 1101,
			season: 6,
			unlockedAt: new Date("2026-01-01T00:00:00Z"),
		});

		await world.completeTournament.complete(tournament, world.manager, ENDS_AT);

		expect(
			world.unlocks.filter((u) => u.userId === ALICE && u.achievementId === 1101),
		).toHaveLength(1);
		expect(world.results[0].achievements.map((a) => a.code)).toEqual([
			"LIGHTNING_PODIUM",
			"LIGHTNING_CHAMPION",
			"LIGHTNING_UNBEATEN",
		]);
	});

	it("unlocks five-time champion with the player's fifth tournament win", async () => {
		const { world, tournament } = finishedArena();
		for (let i = 0; i < 4; i++) {
			world.results.push({
				tournamentId: `earlier-${i}`,
				userId: ALICE,
				position: 1,
				score: 9,
				wins: 3,
				draws: 0,
				losses: 0,
				tiebreak: 0,
				pointsAwarded: 10,
				essenceAwarded: 0,
				achievements: [],
			});
		}

		await world.completeTournament.complete(tournament, world.manager, ENDS_AT);

		const alice = world.results.find((r) => r.tournamentId === TOURNAMENT_ID && r.userId === ALICE);
		expect(alice?.achievements.map((a) => a.code)).toContain("LIGHTNING_CHAMPION_5");
		expect(world.unlocks.some((u) => u.userId === BOB && u.achievementId === 1105)).toBe(false);
	});

	it("completes without the achievements the catalog does not have yet and logs them", async () => {
		const { world, tournament } = finishedArena();
		world.achievementCatalog = world.achievementCatalog.filter(
			(row) => row.code !== "LIGHTNING_CHAMPION" && row.code !== "LIGHTNING_UNBEATEN",
		);

		expect(await world.completeTournament.complete(tournament, world.manager, ENDS_AT)).toBe(
			"completed",
		);

		expect(world.results[0].achievements.map((a) => a.code)).toEqual([
			"LIGHTNING_FIRST",
			"LIGHTNING_PODIUM",
		]);
		expect(world.log.error).toHaveBeenCalledTimes(1);
		expect(String(world.log.error.mock.calls[0][0])).toContain(
			"LIGHTNING_CHAMPION, LIGHTNING_UNBEATEN",
		);
	});

	it("completes with no achievements at all before the catalog is seeded", async () => {
		const { world, tournament } = finishedArena();
		world.achievementCatalog = [];

		expect(await world.completeTournament.complete(tournament, world.manager, ENDS_AT)).toBe(
			"completed",
		);
		expect(world.unlocks).toEqual([]);
		expect(world.results.every((r) => r.achievements.length === 0)).toBe(true);
		expect(world.ledger).toHaveLength(1);
	});

	it("does nothing when the tournament already left finishing", async () => {
		const { world, tournament } = finishedArena();
		world.tournaments.set(TOURNAMENT_ID, { ...tournament, status: "completed" });

		expect(await world.completeTournament.complete(tournament, world.manager, ENDS_AT)).toBe(
			"skipped",
		);
		expect(world.results).toEqual([]);
		expect(world.ledger).toEqual([]);
		expect(world.unlocks).toEqual([]);
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
		expect(world.unlocks).toEqual([]);
		expect(world.log.error).not.toHaveBeenCalled();
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
