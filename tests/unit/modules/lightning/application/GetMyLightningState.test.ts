import { describe, expect, it } from "bun:test";

import { GetMyLightningState } from "../../../../../src/modules/lightning/application/GetMyLightningState";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { ALICE, BOB, CAROL, DAVE, decided, RUNNING_AT, TOURNAMENT_ID, World } from "./fakes";

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
});
