import { describe, expect, it } from "bun:test";

import {
	ALICE,
	BOB,
	CAROL,
	DAVE,
	DECK,
	ERIN,
	RUNNING_AT,
	TOURNAMENT_ID,
	World,
	SALAMANGREAT,
	SKY_STRIKER,
	STARTS_AT,
} from "./fakes";

describe("PairLightningPlayers", () => {
	it("pairs idle players, records each game, marks the entries paired and issues one reservation per pair", async () => {
		const world = new World();
		const tournament = world.seedRunning([ALICE, BOB, CAROL, DAVE, ERIN]);
		world.seedEntry(ALICE, { idleSince: RUNNING_AT, score: 3 });
		world.seedEntry(CAROL, { idleSince: RUNNING_AT, score: 3 });

		const paired = await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT);

		expect(paired).toEqual([
			{
				tournamentId: TOURNAMENT_ID,
				tournamentName: tournament.name,
				reservationId: "RSV0000000000001",
				userIds: [ALICE, CAROL],
				lobbyTimeoutSeconds: 90,
			},
			{
				tournamentId: TOURNAMENT_ID,
				tournamentName: tournament.name,
				reservationId: "RSV0000000000002",
				userIds: [BOB, DAVE],
				lobbyTimeoutSeconds: 90,
			},
		]);
		const games = [...world.games.values()];
		expect(games.map((g) => [g.seat0UserId, g.seat1UserId])).toEqual([
			[ALICE, CAROL],
			[BOB, DAVE],
		]);
		expect(games[0]).toMatchObject({
			reservationId: "RSV0000000000001",
			tournamentId: TOURNAMENT_ID,
			issuedAt: RUNNING_AT,
			status: "pending",
		});
		expect(world.entry(ALICE)).toMatchObject({
			presence: "paired",
			lastOpponentId: CAROL,
			idleSince: null,
		});
		expect(world.entry(CAROL)?.lastOpponentId).toBe(ALICE);
		expect(world.entry(ERIN)).toMatchObject({ presence: "idle" });

		const reservation = world.redis.get("RSV0000000000001");
		expect(reservation).toMatchObject({
			format: "tcg",
			mode: "single",
			options: {
				deckLock: "registered",
				reconnect: true,
				spectators: true,
				listed: false,
				lobbyTimeoutSeconds: 90,
				turnTimeSeconds: 90,
			},
		});
		expect(reservation?.participants).toEqual([
			{ seat: 0, kind: "user", userId: ALICE, requiredDeck: DECK },
			{ seat: 1, kind: "user", userId: CAROL, requiredDeck: DECK },
		]);
		// Rows first, then Redis: a failed write rolls back before the server can see anything.
		expect(world.events.indexOf("issue:RSV0000000000001")).toBeGreaterThan(
			world.events.indexOf("insert-game:RSV0000000000002"),
		);
	});

	it("keeps two players who just met waiting while someone else is still playing", async () => {
		const world = new World();
		const tournament = world.seedRunning([ALICE, BOB, CAROL]);
		world.seedEntry(ALICE, { lastOpponentId: BOB });
		world.seedEntry(BOB, { lastOpponentId: ALICE });
		world.seedEntry(CAROL, { presence: "playing", idleSince: null });

		const paired = await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT);

		expect(paired).toHaveLength(0);
		expect(world.entry(ALICE)).toMatchObject({ presence: "idle" });
	});

	it("lets the last two players of a tournament face each other again", async () => {
		const world = new World();
		const tournament = world.seedRunning([ALICE, BOB, CAROL]);
		world.seedEntry(ALICE, { lastOpponentId: BOB });
		world.seedEntry(BOB, { lastOpponentId: ALICE });
		world.seedEntry(CAROL, { presence: "away", idleSince: null });

		const paired = await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT);

		expect(paired).toHaveLength(1);
	});

	it("considers only active idle players", async () => {
		const world = new World();
		const tournament = world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		world.seedEntry(BOB, { idleSince: null, presence: "away" });
		world.seedEntry(CAROL, { idleSince: RUNNING_AT, status: "withdrawn" });
		world.seedEntry(DAVE, { idleSince: RUNNING_AT, presence: "paired" });

		expect(await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT)).toHaveLength(0);
		expect(world.games.size).toBe(0);
	});

	it("propagates a failed reservation write so the caller rolls the pairing back", async () => {
		const world = new World();
		const tournament = world.seedRunning([ALICE, BOB]);
		world.store.issue = async () => {
			throw new Error("redis down");
		};

		await expect(world.pairPlayers.pair(tournament, world.manager, RUNNING_AT)).rejects.toThrow(
			"redis down",
		);
	});
});

describe("PairLightningPlayers with bots", () => {
	it("seats a bot paired with a human as its WindBot and calls only the human", async () => {
		const world = new World();
		const tournament = world.seedRunning([ALICE]);
		world.seedBot(SALAMANGREAT, { idleSince: STARTS_AT });

		const paired = await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT);

		const [game] = [...world.games.values()];
		const humanSeat = game.seat0UserId === ALICE ? 0 : 1;
		expect(world.redis.get(game.reservationId)?.participants).toEqual(
			humanSeat === 0
				? [
						{ seat: 0, kind: "user", userId: ALICE, requiredDeck: DECK },
						{ seat: 1, kind: "windbot", botName: "Salamangreat" },
					]
				: [
						{ seat: 0, kind: "windbot", botName: "Salamangreat" },
						{ seat: 1, kind: "user", userId: ALICE, requiredDeck: DECK },
					],
		);
		expect(world.events).not.toContain(`announce:${game.reservationId}`);
		expect(paired.map((summons) => summons.userIds)).toEqual([[ALICE]]);
		expect(world.entry(SALAMANGREAT)).toMatchObject({ presence: "paired", lastOpponentId: ALICE });
	});

	it("issues two bots a reservation of two WindBot seats, announces it and calls nobody", async () => {
		const world = new World();
		const tournament = world.seedRunning([]);
		world.seedEntry(ALICE, { presence: "playing", idleSince: null });
		world.seedBot(SALAMANGREAT, { idleSince: STARTS_AT });
		world.seedBot(SKY_STRIKER, { idleSince: STARTS_AT });

		const paired = await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT);

		const [game] = [...world.games.values()];
		expect(world.redis.get(game.reservationId)?.participants).toEqual([
			{ seat: 0, kind: "windbot", botName: "Salamangreat" },
			{ seat: 1, kind: "windbot", botName: "Sky Striker" },
		]);
		// Announced only once the key exists, so the server never looks for a missing key.
		expect(world.events.indexOf(`announce:${game.reservationId}`)).toBeGreaterThan(
			world.events.indexOf(`issue:${game.reservationId}`),
		);
		expect(paired).toEqual([]);
		expect(world.entry(SALAMANGREAT)?.presence).toBe("paired");
		expect(world.entry(SKY_STRIKER)?.presence).toBe("paired");
	});

	it("pairs nobody once no player is left, only bots", async () => {
		const world = new World();
		const tournament = world.seedRunning([]);
		world.seedEntry(ALICE, { status: "withdrawn" });
		world.seedBot(SALAMANGREAT, { idleSince: STARTS_AT });
		world.seedBot(SKY_STRIKER, { idleSince: STARTS_AT });

		expect(await world.pairPlayers.pair(tournament, world.manager, RUNNING_AT)).toEqual([]);
		expect(world.games.size).toBe(0);
	});
});
