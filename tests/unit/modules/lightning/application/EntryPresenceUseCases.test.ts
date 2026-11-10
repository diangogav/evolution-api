import { describe, expect, it } from "bun:test";

import { PauseLightningEntry } from "../../../../../src/modules/lightning/application/PauseLightningEntry";
import { ResumeLightningEntry } from "../../../../../src/modules/lightning/application/ResumeLightningEntry";
import { WithdrawLightningEntry } from "../../../../../src/modules/lightning/application/WithdrawLightningEntry";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { ALICE, BOB, RUNNING_AT, TOURNAMENT_ID, World } from "./fakes";

function setup() {
	const world = new World();
	const deps = [world.tournamentRepository, world.entryRepository, world.transactions] as const;
	return {
		world,
		withdraw: new WithdrawLightningEntry(...deps),
		pause: new PauseLightningEntry(...deps),
		resume: new ResumeLightningEntry(...deps),
	};
}

const input = { tournamentId: TOURNAMENT_ID, userId: ALICE, now: RUNNING_AT };

describe("WithdrawLightningEntry", () => {
	it("withdraws an active entry under the tournament lock; a live game still counts when it ends", async () => {
		const { world, withdraw } = setup();
		world.seedRunning([ALICE, BOB]);
		world.seedGame(ALICE, BOB);

		const view = await withdraw.run(input);

		expect(view.status).toBe("withdrawn");
		expect(world.entry(ALICE)).toMatchObject({ status: "withdrawn", presence: "paired" });
		expect(world.events[0]).toBe(`lock:${TOURNAMENT_ID}`);
	});

	it("answers 404 without an entry and 422 once the tournament ended", async () => {
		const { world, withdraw } = setup();
		world.seedRunning([BOB]);
		await expect(withdraw.run(input)).rejects.toThrow(NotFoundError);

		world.seedTournament({ status: "completed" });
		world.seedEntry(ALICE);
		await expect(withdraw.run(input)).rejects.toThrow(UnprocessableError);
	});
});

describe("PauseLightningEntry", () => {
	it("parks an idle player away so pairing skips them", async () => {
		const { world, pause } = setup();
		world.seedRunning([ALICE, BOB]);

		const view = await pause.run(input);

		expect(view.presence).toBe("away");
		expect(world.entry(ALICE)).toMatchObject({ presence: "away", idleSince: null });
	});

	it("refuses while a game is paired or playing", async () => {
		const { world, pause } = setup();
		world.seedRunning([ALICE, BOB]);
		world.seedGame(ALICE, BOB);

		await expect(pause.run(input)).rejects.toThrow(ConflictError);
	});
});

describe("ResumeLightningEntry", () => {
	it("brings an away player back to the idle queue, waiting from now", async () => {
		const { world, resume } = setup();
		world.seedRunning([ALICE, BOB]);
		world.seedEntry(ALICE, { presence: "away", idleSince: null });

		const view = await resume.run(input);

		expect(view.presence).toBe("idle");
		expect(world.entry(ALICE)?.idleSince).toEqual(RUNNING_AT);
	});

	it("is a no-op for a player who is not away and refuses a removed entry", async () => {
		const { world, resume } = setup();
		world.seedRunning([ALICE, BOB]);

		await resume.run(input);
		expect(world.entry(ALICE)?.idleSince).toEqual(new Date("2026-11-10T20:00:00Z"));

		world.seedEntry(BOB, { status: "removed", presence: "away" });
		await expect(resume.run({ ...input, userId: BOB })).rejects.toThrow(UnprocessableError);
	});
});
