import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { toTournamentView } from "../../../../../src/modules/lightning/application/LightningViews";
import { lightningTournament } from "../../../../../src/modules/lightning/domain/LightningTournament";
import {
	CreateLightningTournamentBodySchema,
	LightningTournamentDetailSchema,
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
			bye: false,
			ceremony: null,
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
		const { ceremony: _ceremony, ...withoutCeremony } = outside;
		expect(Value.Check(MyLightningStateSchema, withoutCeremony)).toBe(false);
	});

	it("accepts the ceremony of a completed tournament with the achievements it unlocked", () => {
		const ceremony = {
			position: 1,
			players: 12,
			score: 12,
			record: { wins: 4, draws: 0, losses: 0 },
			pointsAwarded: 10,
			essenceAwarded: 300,
			achievements: [{ code: "LIGHTNING_UNBEATEN", name: "Unbeaten", essenceReward: 300 }],
		};
		const state = {
			tournament: { ...tournament, status: "completed" },
			players: 0,
			entry: null,
			state: null,
			game: null,
			lastGame: null,
			position: null,
			bye: false,
			ceremony,
		};

		expect(Value.Check(MyLightningStateSchema, state)).toBe(true);
		expect(
			Value.Check(MyLightningStateSchema, {
				...state,
				ceremony: { ...ceremony, record: { wins: 4, draws: 0 } },
			}),
		).toBe(false);
		expect(
			Value.Check(MyLightningStateSchema, {
				...state,
				ceremony: { ...ceremony, achievements: [{ code: "LIGHTNING_FIRST", name: "First" }] },
			}),
		).toBe(false);
	});

	it("describes a Swiss tournament with its round clocks", () => {
		const swiss = { ...tournament, system: "swiss", rounds: 4, currentRound: 2 };

		expect(
			Value.Check(LightningTournamentSchema, { ...swiss, roundEndsAt: tournament.startsAt }),
		).toBe(true);
		expect(Value.Check(LightningTournamentSchema, { ...swiss, system: "bracket" })).toBe(false);
		expect(Value.Check(LightningTournamentSchema, { ...tournament, currentRound: undefined })).toBe(
			false,
		);
	});

	it("describes the current Swiss round in the detail, with no-show seats only when known", () => {
		const player = (userId: string) => ({ userId, username: userId });
		const detail = {
			...tournament,
			system: "swiss",
			rounds: 3,
			currentRound: 1,
			players: 3,
			standings: [],
			watchable: [],
			round: {
				number: 1,
				tables: [
					{
						reservationId: "Xy3kP9aQ2mNb7RtL",
						seat0: player("u-1"),
						seat1: player("u-2"),
						resolution: "no_show",
						noShowSeats: [0, 1],
						roomId: null,
					},
					{
						reservationId: "Ab3kP9aQ2mNb7RtL",
						seat0: player("u-3"),
						seat1: player("u-4"),
						resolution: null,
						roomId: 4213,
					},
				],
				bye: player("u-5"),
			},
		};

		expect(Value.Check(LightningTournamentDetailSchema, detail)).toBe(true);
		expect(Value.Check(LightningTournamentDetailSchema, { ...detail, round: null })).toBe(true);
	});

	it("accepts the Swiss settings in the creation body, within their bounds", () => {
		const body = {
			name: "Swiss Friday",
			format: "tcg",
			registrationOpensAt: "2026-11-10T19:00:00.000Z",
			startsAt: "2026-11-10T20:00:00.000Z",
			endsAt: "2026-11-10T21:00:00.000Z",
		};
		const swiss = {
			...body,
			system: "swiss",
			rounds: null,
			roundMinutes: 40,
			roundBreakSeconds: 0,
		};

		expect(Value.Check(CreateLightningTournamentBodySchema, body)).toBe(true);
		expect(Value.Check(CreateLightningTournamentBodySchema, swiss)).toBe(true);
		expect(Value.Check(CreateLightningTournamentBodySchema, { ...swiss, rounds: 5 })).toBe(true);
		for (const bad of [
			{ rounds: 1 },
			{ rounds: 10 },
			{ roundMinutes: 9 },
			{ roundMinutes: 121 },
			{ roundBreakSeconds: 601 },
			{ system: "bracket" },
		]) {
			expect(Value.Check(CreateLightningTournamentBodySchema, { ...swiss, ...bad })).toBe(false);
		}
	});
});
