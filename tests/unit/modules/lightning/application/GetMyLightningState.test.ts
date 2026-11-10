import { describe, expect, it } from "bun:test";

import { GetMyLightningState } from "../../../../../src/modules/lightning/application/GetMyLightningState";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import {
	ALICE,
	BOB,
	CAROL,
	DAVE,
	decided,
	ENDS_AT,
	ERIN,
	RUNNING_AT,
	TOURNAMENT_ID,
	World,
} from "./fakes";

function setup() {
	const world = new World();
	const getState = new GetMyLightningState(
		world.tournamentRepository,
		world.entryRepository,
		world.gameRepository,
		world.recordReader,
		world.players,
		world.applyGame,
		world.transactions,
		world.byeRepository,
		world.resultRepository,
	);
	return { world, getState };
}

const input = { tournamentId: TOURNAMENT_ID, userId: ALICE, now: RUNNING_AT };

describe("GetMyLightningState", () => {
	it("answers the tournament with a null entry for a player who did not enter", async () => {
		const { world, getState } = setup();
		world.seedRunning([BOB, CAROL]);

		const state = await getState.run(input);

		expect(state).toMatchObject({
			tournament: { id: TOURNAMENT_ID, status: "running" },
			players: 2,
			entry: null,
			state: null,
			game: null,
			lastGame: null,
			position: null,
		});
	});

	it("answers 404 for an unknown tournament", async () => {
		const { getState } = setup();

		await expect(getState.run(input)).rejects.toThrow(NotFoundError);
	});

	it("hands a paired player the room password, seat and opponent", async () => {
		const { world, getState } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const game = world.seedGame(BOB, ALICE);

		const state = await getState.run(input);

		expect(state).toMatchObject({
			entry: { userId: ALICE, presence: "paired" },
			state: "paired",
			game: {
				reservationId: game.reservationId,
				password: `rv#${game.reservationId}`,
				seat: 1,
				roomId: null,
				opponent: { userId: BOB, username: "bob" },
			},
			lastGame: null,
		});
	});

	it("reports playing, with the room id, once the server started the duel", async () => {
		const { world, getState } = setup();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, { roomId: 77, startedAt: RUNNING_AT });

		const state = await getState.run(input);

		expect(state.state).toBe("playing");
		expect(state.game).toMatchObject({ roomId: 77, seat: 0 });
		expect(world.entry(ALICE)?.presence).toBe("playing");
		expect(world.entry(BOB)?.presence).toBe("playing");
	});

	it("applies the player's finished game first and shows its result with the standings position", async () => {
		const { world, getState } = setup();
		world.seedRunning([ALICE, BOB, CAROL]);
		world.seedEntry(CAROL, { idleSince: RUNNING_AT, score: 6, wins: 2, gamesPlayed: 2 });
		const game = world.seedGame(ALICE, BOB);
		const endedAt = new Date(RUNNING_AT.getTime() + 60_000);
		world.record(game.reservationId, decided(0, endedAt));

		const state = await getState.run({ ...input, now: endedAt });

		expect(state).toMatchObject({
			entry: { score: 3, wins: 1, gamesPlayed: 1, presence: "idle" },
			state: "idle",
			game: null,
			lastGame: {
				reservationId: game.reservationId,
				resolution: "seat0_win",
				outcome: "win",
				opponent: { userId: BOB, username: "bob" },
				appliedAt: endedAt.toISOString(),
			},
			position: 2,
		});
		expect(world.events[0]).toBe(`lock:${TOURNAMENT_ID}`);
	});

	it("reports an away player and their strikes", async () => {
		const { world, getState } = setup();
		world.seedRunning([ALICE, BOB]);
		world.seedEntry(ALICE, { presence: "away", noShows: 1, idleSince: null });

		const state = await getState.run(input);

		expect(state).toMatchObject({ state: "away", entry: { noShows: 1 }, game: null });
	});

	it("tells a Swiss player they have the bye this round, not the round before", async () => {
		const { world, getState } = setup();
		world.seedSwiss([ALICE, BOB, CAROL], { currentRound: 2, roundStartedAt: RUNNING_AT });
		world.byes.push({ tournamentId: TOURNAMENT_ID, userId: ALICE, round: 2 });
		world.byes.push({ tournamentId: TOURNAMENT_ID, userId: BOB, round: 1 });

		expect(await getState.run(input)).toMatchObject({ bye: true, state: "idle", game: null });
		expect((await getState.run({ ...input, userId: BOB })).bye).toBe(false);
	});

	it("never reports a Swiss player away, and reads a no-show win back for the present seat", async () => {
		const { world, getState } = setup();
		world.seedSwiss([ALICE, BOB], { currentRound: 1, roundStartedAt: RUNNING_AT });
		world.seedEntry(ALICE, { presence: "away" });
		const game = world.seedGame(BOB, ALICE, {
			round: 1,
			status: "applied",
			resolution: "no_show",
			reason: "lobby_timeout",
			appliedAt: RUNNING_AT,
		});
		world.seedEntry(ALICE, { presence: "away" });
		world.record(game.reservationId, {
			outcome: "abandoned",
			abandonedBySeat: 0,
			endedAt: RUNNING_AT,
		});

		const state = await getState.run(input);

		expect(state.state).toBe("idle");
		expect(state.bye).toBe(false);
		expect(state.lastGame).toMatchObject({ resolution: "no_show", outcome: "win" });
	});

	it("never has a bye in an arena", async () => {
		const { world, getState } = setup();
		world.seedRunning([ALICE, BOB]);

		expect((await getState.run(input)).bye).toBe(false);
	});

	it("has no ceremony while the tournament is still being played", async () => {
		const { world, getState } = setup();
		world.seedRunning([ALICE, BOB]);

		expect((await getState.run(input)).ceremony).toBeNull();
	});

	describe("once the tournament completed", () => {
		async function completed() {
			const context = setup();
			const { world } = context;
			const tournament = world.seedTournament({
				status: "finishing",
				pointsByPosition: { positions: [10, 7], others: 1 },
				essenceByPosition: { positions: [300, 200], others: 25 },
			});
			world.seedEntry(ALICE, { score: 6, wins: 2, gamesPlayed: 2 });
			world.seedEntry(BOB, { score: 4, wins: 1, draws: 1, losses: 1, gamesPlayed: 3 });
			world.seedEntry(CAROL, { score: 1, draws: 1, losses: 2, gamesPlayed: 3 });
			world.seedEntry(DAVE);
			const game = (seat0: string, seat1: string, resolution: "seat0_win" | "draw") =>
				world.seedGame(seat0, seat1, { status: "applied", resolution, appliedAt: ENDS_AT });
			game(ALICE, BOB, "seat0_win");
			game(ALICE, CAROL, "seat0_win");
			game(BOB, CAROL, "draw");
			await world.completeTournament.complete(tournament, world.manager, ENDS_AT);
			return context;
		}

		it("shows the player's final result with the achievements this tournament unlocked", async () => {
			const { getState } = await completed();

			const state = await getState.run({ ...input, userId: BOB, now: ENDS_AT });

			expect(state.ceremony).toEqual({
				position: 2,
				players: 3,
				score: 4,
				record: { wins: 1, draws: 1, losses: 1 },
				pointsAwarded: 7,
				essenceAwarded: 200,
				achievements: [
					{ code: "LIGHTNING_FIRST", name: "First lightning", essenceReward: 50 },
					{ code: "LIGHTNING_PODIUM", name: "Podium", essenceReward: 100 },
				],
			});
		});

		it("keeps showing only what this tournament unlocked", async () => {
			const { world, getState } = await completed();
			world.results = world.results.map((result) =>
				result.userId === ALICE ? { ...result, achievements: [] } : result,
			);

			const state = await getState.run({ ...input, now: ENDS_AT });

			expect(state.ceremony).toMatchObject({ position: 1, essenceAwarded: 300, achievements: [] });
		});

		it("has no ceremony for an entered player who never played, nor for a stranger", async () => {
			const { getState } = await completed();

			expect((await getState.run({ ...input, userId: DAVE, now: ENDS_AT })).ceremony).toBeNull();
			expect((await getState.run({ ...input, userId: ERIN, now: ENDS_AT })).ceremony).toBeNull();
		});
	});
});
