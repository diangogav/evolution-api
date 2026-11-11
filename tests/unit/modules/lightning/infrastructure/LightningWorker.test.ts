import { describe, expect, it, mock } from "bun:test";

import { ProcessLightningTick } from "../../../../../src/modules/lightning/application/ProcessLightningTick";
import type {
	LightningSummons,
	LightningSummonsNotifier,
} from "../../../../../src/modules/lightning/domain/LightningSummons";
import { LightningWorker } from "../../../../../src/modules/lightning/infrastructure/LightningWorker";
import { ALICE, BOB, CAROL, DAVE, RUNNING_AT, World } from "../application/fakes";

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock((_message: unknown) => undefined),
	};
}

const empty = {
	tournaments: 2,
	transitions: 0,
	applied: 0,
	stale: 0,
	paired: 0,
	completed: 0,
	removed: 0,
	failed: 0,
	skipped: false,
	summons: [],
};

describe("LightningWorker", () => {
	it("logs ticks that changed something and stays quiet on idle ones", async () => {
		const log = logger();
		await new LightningWorker({ run: async () => ({ ...empty, paired: 3 }) }, 1000, log).runOnce();
		expect(log.info).toHaveBeenCalledTimes(1);

		const quiet = logger();
		await new LightningWorker({ run: async () => empty }, 1000, quiet).runOnce();
		expect(quiet.info).not.toHaveBeenCalled();
	});

	it("raises an alert when stale games were voided", async () => {
		const log = logger();
		await new LightningWorker({ run: async () => ({ ...empty, stale: 1 }) }, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});

	it("logs a failing tick instead of throwing", async () => {
		const log = logger();
		const failing = {
			run: async () => {
				throw new Error("db down");
			},
		};

		await new LightningWorker(failing, 1000, log).runOnce();

		expect(log.error).toHaveBeenCalledTimes(1);
	});

	it("hands the committed tick's summons to the notifier with the tick time", async () => {
		const notified: Array<{ summons: readonly LightningSummons[]; now: Date }> = [];
		const notifier: LightningSummonsNotifier = {
			notify: async (summons, now) => {
				notified.push({ summons, now });
			},
		};
		const summons = [SUMMONS];

		await new LightningWorker(
			{ run: async () => ({ ...empty, paired: 1, summons }) },
			1000,
			logger(),
			notifier,
		).runOnce(RUNNING_AT);

		expect(notified).toEqual([{ summons, now: RUNNING_AT }]);
	});

	it("does not call the notifier when nothing was paired", async () => {
		const notify = mock(async () => undefined);

		await new LightningWorker({ run: async () => empty }, 1000, logger(), { notify }).runOnce();

		expect(notify).not.toHaveBeenCalled();
	});

	it("does not wait for the notifier to finish", async () => {
		const notify = mock(() => new Promise<void>(() => undefined));

		await new LightningWorker(
			{ run: async () => ({ ...empty, paired: 1, summons: [SUMMONS] }) },
			1000,
			logger(),
			{ notify },
		).runOnce();

		expect(notify).toHaveBeenCalledTimes(1);
	});

	it("logs a notifier that rejects or throws and keeps the tick result", async () => {
		const tick = { run: async () => ({ ...empty, paired: 1, summons: [SUMMONS] }) };
		const rejecting = logger();
		await new LightningWorker(tick, 1000, rejecting, {
			notify: async () => {
				throw new Error("push down");
			},
		}).runOnce();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(String(rejecting.error.mock.calls[0]?.[0])).toContain("push down");
		expect(rejecting.info).toHaveBeenCalledTimes(1);

		const throwing = logger();
		await new LightningWorker(tick, 1000, throwing, {
			notify: () => {
				throw new Error("sync failure");
			},
		}).runOnce();
		expect(String(throwing.error.mock.calls[0]?.[0])).toContain("sync failure");
		expect(throwing.info).toHaveBeenCalledTimes(1);
	});

	it("notifies only after the tick's transaction commits", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const run = world.unitOfWork.run;
		world.unitOfWork.run = (async (work) => {
			const result = await run(work);
			world.events.push("commit");
			return result;
		}) as typeof run;
		const notifier: LightningSummonsNotifier = {
			notify: async (summons) => {
				world.events.push(`notify:${summons.map((s) => s.reservationId).join(",")}`);
			},
		};

		await new LightningWorker(tickOf(world), 1000, logger(), notifier).runOnce(RUNNING_AT);

		const games = [...world.games.values()].map((g) => g.reservationId);
		expect(games).toHaveLength(2);
		expect(world.events.slice(-2)).toEqual(["commit", `notify:${games.join(",")}`]);
	});

	it("never notifies when the tick's transaction rolls back", async () => {
		const world = new World();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const run = world.unitOfWork.run;
		world.unitOfWork.run = (async (work) => {
			await run(work);
			throw new Error("commit failed");
		}) as typeof run;
		const notify = mock(async () => undefined);
		const log = logger();

		await new LightningWorker(tickOf(world), 1000, log, { notify }).runOnce(RUNNING_AT);

		expect(world.games.size).toBe(2);
		expect(notify).not.toHaveBeenCalled();
		expect(log.error).toHaveBeenCalledTimes(1);
	});
});

const SUMMONS: LightningSummons = {
	tournamentId: "t-1",
	tournamentName: "Friday Lightning",
	reservationId: "RSV0000000000001",
	userIds: ["u-1", "u-2"],
	lobbyTimeoutSeconds: 90,
};

function tickOf(world: World): ProcessLightningTick {
	return new ProcessLightningTick(
		world.unitOfWork,
		world.tournamentRepository,
		world.entryRepository,
		world.gameRepository,
		world.applyGame,
		world.pairPlayers,
		world.closeSwissRound,
		world.pairSwissRound,
		world.completeTournament,
		world.log,
	);
}
