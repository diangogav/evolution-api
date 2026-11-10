import { describe, expect, it } from "bun:test";

import { CancelLightningTournament } from "../../../../../src/modules/lightning/application/CancelLightningTournament";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { ALICE, BOB, CAROL, DAVE, RUNNING_AT, TOURNAMENT_ID, World } from "./fakes";

function setup() {
	const world = new World();
	const cancel = new CancelLightningTournament(
		world.tournamentRepository,
		world.gameRepository,
		world.store,
		world.transactions,
		world.log,
	);
	return { world, cancel };
}

describe("CancelLightningTournament", () => {
	it("cancels a running tournament, voids its live games and revokes their reservations", async () => {
		const { world, cancel } = setup();
		world.seedRunning([ALICE, BOB, CAROL, DAVE]);
		const live = world.seedGame(ALICE, BOB);
		const claimed = world.seedGame(CAROL, DAVE);
		world.claim(claimed.reservationId);

		const view = await cancel.run({
			tournamentId: TOURNAMENT_ID,
			reason: "Server maintenance",
			now: RUNNING_AT,
		});

		expect(view).toMatchObject({ status: "cancelled", cancelledReason: "Server maintenance" });
		expect(world.games.get(live.reservationId)).toMatchObject({
			status: "voided",
			reason: "cancelled",
		});
		expect(world.games.get(claimed.reservationId)?.status).toBe("voided");
		expect(world.redis.has(live.reservationId)).toBe(false);
		expect(world.redis.has(claimed.reservationId)).toBe(true);
		expect(world.ledger).toEqual([]);
	});

	it("answers 404 for an unknown id and 409 once the tournament ended", async () => {
		const { world, cancel } = setup();
		const input = { tournamentId: TOURNAMENT_ID, reason: "x", now: RUNNING_AT };

		await expect(cancel.run(input)).rejects.toThrow(NotFoundError);

		world.seedTournament({ status: "completed" });
		await expect(cancel.run(input)).rejects.toThrow(ConflictError);
		world.seedTournament({ status: "cancelled" });
		await expect(cancel.run(input)).rejects.toThrow(ConflictError);
	});
});
