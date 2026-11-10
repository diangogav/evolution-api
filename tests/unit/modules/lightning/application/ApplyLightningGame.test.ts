import { describe, expect, it } from "bun:test";

import { UNCLAIMED_RESERVATION_MS } from "../../../../../src/modules/lightning/domain/resolveLightningGame";
import { ALICE, BOB, CAROL, decided, RUNNING_AT, STALE_MS, World } from "./fakes";

const later = (ms: number) => new Date(RUNNING_AT.getTime() + ms);

describe("ApplyLightningGame", () => {
	it("scores a decided duel for both seats, frees them and resolves the game once", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB, CAROL]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, decided(1));

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("applied");

		expect(world.entry(ALICE)).toMatchObject({
			score: 0,
			losses: 1,
			gamesPlayed: 1,
			presence: "idle",
			idleSince: later(60_000),
			lastOpponentId: BOB,
		});
		expect(world.entry(BOB)).toMatchObject({ score: 3, wins: 1, gamesPlayed: 1, presence: "idle" });
		expect(world.games.get(game.reservationId)).toMatchObject({
			status: "applied",
			resolution: "seat1_win",
			reason: "win",
			appliedAt: later(60_000),
		});
		expect(world.redis.has(game.reservationId)).toBe(true);

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("skipped");
		expect(world.entry(BOB)?.score).toBe(3);
	});

	it("leaves a room still in its lobby pending, both seats paired", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId);

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("live");
		expect(world.entry(ALICE)?.presence).toBe("paired");
	});

	it("marks both seats playing once the server started the duel, once", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, { startedAt: RUNNING_AT });

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("live");
		expect(world.entry(ALICE)?.presence).toBe("playing");
		expect(world.entry(BOB)?.presence).toBe("playing");

		const writes = world.events.length;
		await world.applyGame.applyGame(game, world.manager, later(61_000));
		expect(world.events.length).toBe(writes);
	});

	it("a no-show parks the absent seat away with a strike, frees the other, and revokes the reservation", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, {
			endedAt: RUNNING_AT,
			outcome: "abandoned",
			abandonedBySeat: 1,
			reason: "no_show",
		});

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("applied");

		expect(world.entry(BOB)).toMatchObject({ presence: "away", noShows: 1, gamesPlayed: 0 });
		expect(world.entry(ALICE)).toMatchObject({ presence: "idle", gamesPlayed: 0 });
		expect(world.games.get(game.reservationId)?.status).toBe("applied");
		expect(world.redis.has(game.reservationId)).toBe(false);
	});

	it("a void frees both seats without counting a game and revokes the reservation", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, {
			endedAt: RUNNING_AT,
			outcome: "abandoned",
			abandonedBySeat: null,
			reason: "server_restart",
		});

		await world.applyGame.applyGame(game, world.manager, later(60_000));

		expect(world.games.get(game.reservationId)).toMatchObject({
			status: "voided",
			resolution: "void",
		});
		expect(world.entry(ALICE)).toMatchObject({ presence: "idle", gamesPlayed: 0 });
		expect(world.redis.has(game.reservationId)).toBe(false);
	});

	it("a reservation nobody claimed is revoked first; if the server got there, the game stays pending", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		const expired = later(UNCLAIMED_RESERVATION_MS + 1);

		expect(await world.applyGame.applyGame(game, world.manager, later(1000))).toBe("live");

		world.claim(game.reservationId);
		expect(await world.applyGame.applyGame(game, world.manager, expired)).toBe("live");
		expect(world.games.get(game.reservationId)?.status).toBe("pending");

		world.redis.get(game.reservationId)!.claimed = false;
		expect(await world.applyGame.applyGame(game, world.manager, expired)).toBe("applied");
		expect(world.entry(ALICE)).toMatchObject({ presence: "away", noShows: 1 });
		expect(world.entry(BOB)).toMatchObject({ presence: "away", noShows: 1 });
		expect(world.games.get(game.reservationId)).toMatchObject({
			resolution: "no_show",
			reason: "unclaimed",
		});
	});

	it("voids a row left open past the stale threshold and reports it", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, { startedAt: RUNNING_AT });

		expect(await world.applyGame.applyGame(game, world.manager, later(STALE_MS + 1))).toBe("stale");
		expect(world.games.get(game.reservationId)).toMatchObject({
			status: "voided",
			reason: "stale",
		});
		expect(world.entry(ALICE)?.presence).toBe("idle");
	});

	it("a failed revoke after a void is logged, never thrown", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB);
		world.record(game.reservationId, {
			endedAt: RUNNING_AT,
			outcome: "abandoned",
			reason: "room_closed",
		});
		world.store.revoke = async () => {
			throw new Error("redis down");
		};

		expect(await world.applyGame.applyGame(game, world.manager, later(1000))).toBe("applied");
		expect(world.log.error).toHaveBeenCalledTimes(1);
	});
});

describe("ApplyLightningGame — Swiss games", () => {
	it("gives the present seat the win and the absent one a lost game with a strike", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB, { round: 1 });
		world.record(game.reservationId, {
			startedAt: null,
			endedAt: RUNNING_AT,
			outcome: "abandoned",
			abandonedBySeat: 1,
			reason: "lobby_timeout",
		});

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("applied");

		expect(world.entry(ALICE)).toMatchObject({
			score: 3,
			wins: 1,
			gamesPlayed: 1,
			presence: "idle",
		});
		expect(world.entry(BOB)).toMatchObject({
			score: 0,
			losses: 1,
			gamesPlayed: 1,
			noShows: 1,
			presence: "idle",
			status: "active",
		});
		expect(world.games.get(game.reservationId)).toMatchObject({ resolution: "no_show" });
	});

	it("counts an unclaimed reservation as a loss for both and drops a player at the second strike", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		world.seedEntry(BOB, { noShows: 1 });
		const game = world.seedGame(ALICE, BOB, { round: 2 });

		await world.applyGame.applyGame(game, world.manager, later(UNCLAIMED_RESERVATION_MS + 1));

		expect(world.entry(ALICE)).toMatchObject({ losses: 1, noShows: 1, status: "active" });
		expect(world.entry(BOB)).toMatchObject({ losses: 1, noShows: 2, status: "removed" });
		expect(world.entry(BOB)?.presence).not.toBe("away");
	});

	it("voids an infrastructure failure without scoring, leaving the pair for a new reservation", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB]);
		const game = world.seedGame(ALICE, BOB, { round: 1 });
		world.record(game.reservationId, {
			startedAt: null,
			endedAt: RUNNING_AT,
			outcome: "abandoned",
			reason: "server_restart",
		});

		expect(await world.applyGame.applyGame(game, world.manager, later(60_000))).toBe("applied");

		expect(world.games.get(game.reservationId)).toMatchObject({ status: "voided" });
		expect(world.entry(ALICE)).toMatchObject({ score: 0, gamesPlayed: 0, presence: "idle" });
	});
});
