import { describe, expect, it } from "bun:test";

import { GetLightningTournament } from "../../../../../src/modules/lightning/application/GetLightningTournament";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { ALICE, BOB, CAROL, DAVE, ENDS_AT, RUNNING_AT, TOURNAMENT_ID, World } from "./fakes";

function setup() {
	const world = new World();
	const getTournament = new GetLightningTournament(
		world.tournamentRepository,
		world.entryRepository,
		world.gameRepository,
		world.resultRepository,
		world.recordReader,
		world.players,
	);
	return { world, getTournament };
}

describe("GetLightningTournament", () => {
	it("answers the detail with live standings and the rooms spectators can watch", async () => {
		const { world, getTournament } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		world.seedEntry(ALICE, { idleSince: RUNNING_AT, score: 3, wins: 1, gamesPlayed: 1 });
		world.seedEntry(BOB, { idleSince: RUNNING_AT, losses: 1, gamesPlayed: 1, status: "withdrawn" });
		world.seedGame(ALICE, BOB, {
			status: "applied",
			resolution: "seat0_win",
			appliedAt: RUNNING_AT,
		});
		const live = world.seedGame(CAROL, DAVE);
		world.record(live.reservationId, { roomId: 91, startedAt: RUNNING_AT });
		const lobby = world.seedGame(ALICE, BOB, { reservationId: "LOBBY00000000001" });
		world.record(lobby.reservationId, { roomId: 92 });

		const detail = await getTournament.run({ tournamentId: TOURNAMENT_ID, now: RUNNING_AT });

		expect(detail).toMatchObject({ id: TOURNAMENT_ID, status: "running", players: 3 });
		// Bob left after playing Alice: he stays ranked, and his Buchholz (3) puts him ahead.
		expect(detail.standings.map((s) => [s.position, s.username, s.score, s.status])).toEqual([
			[1, "alice", 3, "active"],
			[2, "bob", 0, "withdrawn"],
			[3, "carol", 0, "active"],
			[4, "dave", 0, "active"],
		]);
		expect(detail.standings[0]).toMatchObject({ pointsAwarded: null, essenceAwarded: null });
		expect(detail.watchable).toEqual([
			{
				reservationId: live.reservationId,
				roomId: 91,
				startedAt: RUNNING_AT.toISOString(),
				players: [
					{ userId: CAROL, username: "carol" },
					{ userId: DAVE, username: "dave" },
				],
			},
			{
				reservationId: "LOBBY00000000001",
				roomId: 92,
				startedAt: null,
				players: [
					{ userId: ALICE, username: "alice" },
					{ userId: BOB, username: "bob" },
				],
			},
		]);
	});

	it("attaches the awards once the tournament completed and hides players who never played", async () => {
		const { world, getTournament } = setup();
		world.seedTournament({ status: "completed" });
		world.seedEntry(ALICE, { score: 3, wins: 1, gamesPlayed: 1 });
		world.seedEntry(BOB);
		world.results.push({
			tournamentId: TOURNAMENT_ID,
			userId: ALICE,
			position: 1,
			score: 3,
			wins: 1,
			draws: 0,
			losses: 0,
			tiebreak: 0,
			pointsAwarded: 10,
			essenceAwarded: 50,
		});

		const detail = await getTournament.run({ tournamentId: TOURNAMENT_ID, now: ENDS_AT });

		expect(detail.standings).toEqual([
			{
				position: 1,
				userId: ALICE,
				username: "alice",
				status: "active",
				score: 3,
				wins: 1,
				draws: 0,
				losses: 0,
				gamesPlayed: 1,
				tiebreak: 0,
				pointsAwarded: 10,
				essenceAwarded: 50,
			},
		]);
		expect(detail.watchable).toEqual([]);
	});

	it("answers 404 for an unknown tournament", async () => {
		const { getTournament } = setup();

		await expect(getTournament.run({ tournamentId: "nope", now: RUNNING_AT })).rejects.toThrow(
			NotFoundError,
		);
	});
});
