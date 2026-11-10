import { describe, expect, it } from "bun:test";

import { EnterLightningTournament } from "../../../../../src/modules/lightning/application/EnterLightningTournament";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { ALICE, BOB, DECK, REGISTRATION_AT, RUNNING_AT, TOURNAMENT_ID, World } from "./fakes";

function setup() {
	const world = new World();
	const enter = new EnterLightningTournament(
		world.tournamentRepository,
		world.entryRepository,
		world.legality,
		world.transactions,
	);
	return { world, enter };
}

const at = (now: Date, userId = ALICE) => ({
	tournamentId: TOURNAMENT_ID,
	userId,
	deck: DECK,
	now,
});

describe("EnterLightningTournament", () => {
	it("registers an idle entry under the tournament lock, waiting only once the arena runs", async () => {
		const { world, enter } = setup();
		world.seedTournament({ status: "registration" });

		const view = await enter.run(at(REGISTRATION_AT));

		expect(view).toMatchObject({ userId: ALICE, status: "active", presence: "idle", score: 0 });
		expect(world.entry(ALICE)).toMatchObject({ idleSince: null, deck: DECK });
		expect(world.events).toEqual([`lock:${TOURNAMENT_ID}`, `insert-entry:${ALICE}`]);
	});

	it("a late entry while running starts waiting at once", async () => {
		const { world, enter } = setup();
		world.seedTournament({ status: "running" });

		await enter.run(at(RUNNING_AT));

		expect(world.entry(ALICE)?.idleSince).toEqual(RUNNING_AT);
	});

	it("closes Swiss entries at the start: no late registration", async () => {
		const { world, enter } = setup();
		world.seedTournament({ system: "swiss", status: "registration" });
		await enter.run(at(REGISTRATION_AT));

		world.seedTournament({ system: "swiss", status: "running" });
		await expect(enter.run(at(RUNNING_AT, BOB))).rejects.toThrow(UnprocessableError);
		expect(world.entry(BOB)).toBeUndefined();
	});

	it("answers 404 for an unknown tournament and 422 when registration is not open", async () => {
		const { world, enter } = setup();

		await expect(enter.run(at(REGISTRATION_AT))).rejects.toThrow(NotFoundError);

		for (const status of ["scheduled", "finishing", "completed", "cancelled"] as const) {
			world.seedTournament({ status });
			await expect(enter.run(at(REGISTRATION_AT))).rejects.toThrow(UnprocessableError);
		}
	});

	it("answers 422 with the reason for an illegal deck, before touching the database", async () => {
		const { world, enter } = setup();
		world.seedTournament({ status: "registration" });
		world.legal = { legal: false, reason: "card 1000 is not allowed in 2026.9 TCG" };

		await expect(enter.run(at(REGISTRATION_AT))).rejects.toThrow(
			"card 1000 is not allowed in 2026.9 TCG",
		);
		expect(world.events).toEqual([]);
	});

	it("answers 422 when the tournament is full and 409 when already entered", async () => {
		const { world, enter } = setup();
		world.seedTournament({ status: "registration", minPlayers: 2, maxPlayers: 2 });
		world.seedEntry(BOB);

		await enter.run(at(REGISTRATION_AT));
		await expect(enter.run(at(REGISTRATION_AT))).rejects.toThrow(ConflictError);
		await expect(enter.run(at(REGISTRATION_AT, "someone-else"))).rejects.toThrow(
			UnprocessableError,
		);
	});

	it("re-activates a withdrawn entry with the new deck, keeping its record, and refuses a removed one", async () => {
		const { world, enter } = setup();
		world.seedTournament({ status: "running" });
		world.seedEntry(ALICE, { status: "withdrawn", score: 3, wins: 1, gamesPlayed: 1 });
		world.seedEntry(BOB, { status: "removed" });
		const newDeck = { ...DECK, side: [7] };

		await enter.run({ ...at(RUNNING_AT), deck: newDeck });

		expect(world.entry(ALICE)).toMatchObject({
			status: "active",
			presence: "idle",
			idleSince: RUNNING_AT,
			score: 3,
			deck: newDeck,
		});
		await expect(enter.run(at(RUNNING_AT, BOB))).rejects.toThrow(UnprocessableError);
	});
});
