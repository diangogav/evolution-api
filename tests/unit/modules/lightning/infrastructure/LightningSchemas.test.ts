import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { toTournamentView } from "../../../../../src/modules/lightning/application/LightningViews";
import { lightningTournament } from "../../../../../src/modules/lightning/domain/LightningTournament";
import {
	LightningTournamentSchema,
	MyLightningStateSchema,
} from "../../../../../src/modules/lightning/infrastructure/LightningSchemas";

const tournament = toTournamentView(
	lightningTournament({
		id: "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b",
		name: "Friday Lightning",
		format: "edison",
		season: 7,
		registrationOpensAt: new Date("2026-11-10T19:00:00Z"),
		startsAt: new Date("2026-11-10T20:00:00Z"),
		endsAt: new Date("2026-11-10T21:00:00Z"),
		createdBy: "admin-1",
		now: new Date("2026-11-10T18:00:00Z"),
	}),
);

describe("LightningSchemas", () => {
	it("describes the tournament view the use cases return", () => {
		expect(Value.Check(LightningTournamentSchema, tournament)).toBe(true);
	});

	it("accepts the state of a player who did not enter and of one paired for a duel", () => {
		const outside = {
			tournament,
			players: 0,
			entry: null,
			state: null,
			game: null,
			lastGame: null,
			position: null,
		};
		const paired = {
			...outside,
			players: 2,
			entry: {
				userId: "u-1",
				status: "active",
				presence: "paired",
				score: 3,
				wins: 1,
				draws: 0,
				losses: 0,
				gamesPlayed: 1,
				noShows: 0,
				registeredAt: "2026-11-10T19:05:00.000Z",
			},
			state: "paired",
			game: {
				reservationId: "Xy3kP9aQ2mNb7RtL",
				password: "rv#Xy3kP9aQ2mNb7RtL",
				seat: 1,
				roomId: null,
				opponent: { userId: "u-2", username: "bob" },
			},
			position: 1,
		};

		expect(Value.Check(MyLightningStateSchema, outside)).toBe(true);
		expect(Value.Check(MyLightningStateSchema, paired)).toBe(true);
		expect(Value.Check(MyLightningStateSchema, { ...paired, state: "bracket" })).toBe(false);
	});
});
