import { describe, expect, it } from "bun:test";

import { EnterLightningTournament } from "../../../../../src/modules/lightning/application/EnterLightningTournament";
import type { VerificationFacts } from "../../../../../src/modules/user";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { ForbiddenError } from "../../../../../src/shared/errors/ForbiddenError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { ALICE, BOB, DECK, REGISTRATION_AT, RUNNING_AT, TOURNAMENT_ID, World } from "./fakes";

const CUTOFF = new Date("2026-11-24T00:00:00Z");

const UNVERIFIED: VerificationFacts = {
	emailVerifiedAt: null,
	discordId: null,
	createdAt: new Date("2026-12-01T00:00:00Z"),
};

class FakeAccounts {
	readonly facts = new Map<string, VerificationFacts>();
	readonly lookups: string[] = [];

	async verificationFacts(userId: string): Promise<VerificationFacts | null> {
		this.lookups.push(userId);
		return this.facts.get(userId) ?? null;
	}
}

function setup({ verifiedRequired = false } = {}) {
	const world = new World();
	const accounts = new FakeAccounts();
	const enter = new EnterLightningTournament(
		world.tournamentRepository,
		world.entryRepository,
		world.legality,
		world.transactions,
		accounts,
		{ required: verifiedRequired, cutoff: CUTOFF },
	);
	return { world, enter, accounts };
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

	describe("when tournaments require a verified account", () => {
		it("lets a verified account enter", async () => {
			const { world, enter, accounts } = setup({ verifiedRequired: true });
			world.seedTournament({ status: "registration" });
			accounts.facts.set(ALICE, { ...UNVERIFIED, discordId: "1234" });

			await enter.run(at(REGISTRATION_AT));

			expect(world.entry(ALICE)).toMatchObject({ status: "active" });
		});

		it("counts an account created before the cutoff as verified", async () => {
			const { world, enter, accounts } = setup({ verifiedRequired: true });
			world.seedTournament({ status: "registration" });
			accounts.facts.set(ALICE, { ...UNVERIFIED, createdAt: new Date("2026-01-01T00:00:00Z") });

			await enter.run(at(REGISTRATION_AT));

			expect(world.entry(ALICE)).toMatchObject({ status: "active" });
		});

		it("refuses an unverified account before storing anything", async () => {
			const { world, enter, accounts } = setup({ verifiedRequired: true });
			world.seedTournament({ status: "registration" });
			accounts.facts.set(ALICE, UNVERIFIED);

			const attempt = enter.run(at(REGISTRATION_AT));

			await expect(attempt).rejects.toThrow(ForbiddenError);
			await expect(attempt).rejects.toThrow("Verify your email to join tournaments");
			expect(world.events).toEqual([]);
			expect(world.entry(ALICE)).toBeUndefined();
		});

		it("refuses an account it knows nothing about", async () => {
			const { world, enter } = setup({ verifiedRequired: true });
			world.seedTournament({ status: "registration" });

			await expect(enter.run(at(REGISTRATION_AT))).rejects.toThrow(ForbiddenError);
			expect(world.events).toEqual([]);
		});
	});

	it("does not look the account up while the switch is off", async () => {
		const { world, enter, accounts } = setup();
		world.seedTournament({ status: "registration" });
		accounts.facts.set(ALICE, UNVERIFIED);

		await enter.run(at(REGISTRATION_AT));

		expect(world.entry(ALICE)).toMatchObject({ status: "active" });
		expect(accounts.lookups).toEqual([]);
	});
});
