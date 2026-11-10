import { describe, expect, it } from "bun:test";

import { CreateLightningTournament } from "../../../../../src/modules/lightning/application/CreateLightningTournament";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { ADMIN, CREATED_AT, ENDS_AT, REGISTRATION_AT, STARTS_AT, World } from "./fakes";

const input = {
	name: "Friday Lightning",
	format: "tcg" as const,
	season: 7,
	registrationOpensAt: REGISTRATION_AT,
	startsAt: STARTS_AT,
	endsAt: ENDS_AT,
	createdBy: ADMIN,
	now: CREATED_AT,
};

describe("CreateLightningTournament", () => {
	it("stores the tournament with its defaults and answers the view", async () => {
		const world = new World();
		const create = new CreateLightningTournament(world.tournamentRepository, () => "new-id");

		const view = await create.run(input);

		expect(view).toMatchObject({
			id: "new-id",
			name: "Friday Lightning",
			status: "scheduled",
			season: 7,
			registrationOpensAt: "2026-11-10T19:00:00.000Z",
			startsAt: "2026-11-10T20:00:00.000Z",
			endsAt: "2026-11-10T21:00:00.000Z",
			turnTimeSeconds: 90,
			minPlayers: 4,
			maxPlayers: 64,
			pointsByPosition: { positions: [10, 7, 5, 3], others: 1 },
			cancelledReason: null,
		});
		expect(world.tournaments.get("new-id")?.createdBy).toBe(ADMIN);
	});

	it("answers 422 for a tournament the rules reject", async () => {
		const create = new CreateLightningTournament(new World().tournamentRepository);

		await expect(create.run({ ...input, turnTimeSeconds: 10 })).rejects.toThrow(UnprocessableError);
		await expect(create.run({ ...input, startsAt: CREATED_AT })).rejects.toThrow(
			UnprocessableError,
		);
	});
});
