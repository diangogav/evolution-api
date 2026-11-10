import { describe, expect, it } from "bun:test";

import { GetMyActiveLightningEntries } from "../../../../../src/modules/lightning/application/GetMyActiveLightningEntries";
import { ALICE, BOB, CAROL, DAVE, STARTS_AT, TOURNAMENT_ID, World } from "./fakes";

const OTHER_ID = "2b7e1516-28ae-4d2a-a6d2-abf7158809cf";

function setup() {
	const world = new World();
	const getActive = new GetMyActiveLightningEntries(
		world.entryRepository,
		world.recordReader,
		world.players,
	);
	return { world, getActive };
}

describe("GetMyActiveLightningEntries", () => {
	it("answers nothing for a player with no active entry", async () => {
		const { world, getActive } = setup();
		world.seedRunning([BOB, CAROL]);

		expect(await getActive.run({ userId: ALICE })).toEqual([]);
	});

	it("hands a paired player the same game view as the waiting room, with the room once opened", async () => {
		const { world, getActive } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const game = world.seedGame(BOB, ALICE);
		world.record(game.reservationId, { roomId: 4213 });

		expect(await getActive.run({ userId: ALICE })).toEqual([
			{
				tournamentId: TOURNAMENT_ID,
				name: "Friday Lightning",
				system: "arena",
				status: "running",
				startsAt: STARTS_AT.toISOString(),
				state: "paired",
				game: {
					reservationId: game.reservationId,
					password: `rv#${game.reservationId}`,
					seat: 1,
					roomId: 4213,
					opponent: { userId: BOB, username: "bob" },
				},
				bye: false,
			},
		]);
	});

	it("leaves the room null until the server opens it, and the game null when nothing is pending", async () => {
		const { world, getActive } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const game = world.seedGame(ALICE, BOB);

		const [paired] = await getActive.run({ userId: ALICE });
		const [waiting] = await getActive.run({ userId: CAROL });

		expect(paired.game).toMatchObject({ reservationId: game.reservationId, seat: 0, roomId: null });
		expect(waiting).toMatchObject({ state: "idle", game: null, bye: false });
	});

	it("reports the bye of the current Swiss round and never an away Swiss player", async () => {
		const { world, getActive } = setup();
		world.seedSwiss([ALICE, BOB, CAROL], { currentRound: 2 });
		world.entries.set(`${TOURNAMENT_ID}|${ALICE}`, {
			...(world.entry(ALICE) as NonNullable<ReturnType<World["entry"]>>),
			presence: "away",
		});
		world.byes.push(
			{ tournamentId: TOURNAMENT_ID, userId: ALICE, round: 2 },
			{ tournamentId: TOURNAMENT_ID, userId: BOB, round: 1 },
		);

		const [alice] = await getActive.run({ userId: ALICE });
		const [bob] = await getActive.run({ userId: BOB });

		expect(alice).toMatchObject({ system: "swiss", state: "idle", bye: true, game: null });
		expect(bob.bye).toBe(false);
	});

	it("keeps only active entries of live tournaments, soonest start first", async () => {
		const { world, getActive } = setup();
		world.seedRunning([ALICE]);
		const later = new Date(STARTS_AT.getTime() + 24 * 3600 * 1000);
		const earlier = new Date(STARTS_AT.getTime() - 3600 * 1000);
		world.tournaments.set(OTHER_ID, {
			...(world.tournaments.get(TOURNAMENT_ID) as NonNullable<
				ReturnType<World["tournaments"]["get"]>
			>),
			id: OTHER_ID,
			name: "Saturday Lightning",
			status: "registration",
			startsAt: earlier,
		});
		world.seedEntry(ALICE, { tournamentId: OTHER_ID });
		for (const [id, status] of [
			["3c2a1f0e-7b6d-4e5f-8a9b-0c1d2e3f4a5b", "scheduled"],
			["9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b", "completed"],
			["5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a", "cancelled"],
		] as const) {
			world.tournaments.set(id, {
				...(world.tournaments.get(TOURNAMENT_ID) as NonNullable<
					ReturnType<World["tournaments"]["get"]>
				>),
				id,
				status,
				startsAt: later,
			});
			world.seedEntry(ALICE, { tournamentId: id });
		}
		const withdrawnId = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
		world.tournaments.set(withdrawnId, {
			...(world.tournaments.get(TOURNAMENT_ID) as NonNullable<
				ReturnType<World["tournaments"]["get"]>
			>),
			id: withdrawnId,
			status: "finishing",
			startsAt: later,
		});
		world.seedEntry(ALICE, { tournamentId: withdrawnId, status: "withdrawn" });

		const active = await getActive.run({ userId: ALICE });

		expect(active.map((entry) => [entry.tournamentId, entry.status])).toEqual([
			[OTHER_ID, "registration"],
			[TOURNAMENT_ID, "running"],
		]);
	});
});
