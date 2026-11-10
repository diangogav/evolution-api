import { t } from "elysia";

import { LIGHTNING_ENTRY_STATUSES, LIGHTNING_PRESENCES } from "../domain/LightningEntry";
import { LIGHTNING_GAME_RESOLUTIONS } from "../domain/LightningGame";
import { LIGHTNING_FORMATS, LIGHTNING_TOURNAMENT_STATUSES } from "../domain/LightningTournament";

const literals = <T extends string>(values: readonly T[]) =>
	t.Union(values.map((value) => t.Literal(value)));

const DateTime = (description?: string) => t.String({ format: "date-time", description });

export const LightningFormatSchema = literals(LIGHTNING_FORMATS);
export const LightningTournamentStatusSchema = literals(LIGHTNING_TOURNAMENT_STATUSES);
export const LightningPresenceSchema = literals(LIGHTNING_PRESENCES);

export const PrizeTableSchema = t.Object(
	{
		positions: t.Array(t.Integer({ minimum: 0 }), {
			description: "Amount per final position, first place first",
			maxItems: 64,
		}),
		others: t.Integer({ minimum: 0, description: "Amount for every ranked player below them" }),
	},
	{ description: "Prize per final position" },
);

const tournamentFields = {
	id: t.String({ format: "uuid" }),
	name: t.String(),
	format: LightningFormatSchema,
	status: LightningTournamentStatusSchema,
	season: t.Integer(),
	registrationOpensAt: DateTime(),
	startsAt: DateTime("Pairing starts; late entries are accepted while running"),
	endsAt: DateTime("No new pairings after this; games already live finish"),
	turnTimeSeconds: t.Integer({ description: "Seconds each player has per turn, reset every turn" }),
	lobbyTimeoutSeconds: t.Integer({ description: "Seconds both players have to join the room" }),
	minPlayers: t.Integer({
		description: "Entries needed at startsAt, or the tournament is cancelled",
	}),
	maxPlayers: t.Integer(),
	pointsByPosition: PrizeTableSchema,
	essenceByPosition: PrizeTableSchema,
	cancelledReason: t.Nullable(t.String()),
	createdAt: DateTime(),
};

export const LightningTournamentSchema = t.Object(tournamentFields);

export const LightningTournamentListSchema = t.Array(
	t.Object({ ...tournamentFields, players: t.Integer({ description: "Active entries" }) }),
);

export const LightningEntrySchema = t.Object({
	userId: t.String(),
	status: literals(LIGHTNING_ENTRY_STATUSES),
	presence: LightningPresenceSchema,
	score: t.Integer({ description: "Win 3, draw 1, loss 0" }),
	wins: t.Integer(),
	draws: t.Integer(),
	losses: t.Integer(),
	gamesPlayed: t.Integer(),
	noShows: t.Integer({ description: "Rooms missed; the third removes the entry" }),
	registeredAt: DateTime(),
});

const PlayerRefSchema = t.Object({ userId: t.String(), username: t.String() });

export const LightningStandingSchema = t.Object({
	position: t.Integer(),
	userId: t.String(),
	username: t.String(),
	status: literals(LIGHTNING_ENTRY_STATUSES),
	score: t.Integer(),
	wins: t.Integer(),
	draws: t.Integer(),
	losses: t.Integer(),
	gamesPlayed: t.Integer(),
	tiebreak: t.Integer({ description: "Buchholz: sum of the scores of the opponents played" }),
	pointsAwarded: t.Nullable(t.Integer({ description: "Season points; null until completed" })),
	essenceAwarded: t.Nullable(t.Integer({ description: "Essence; null until completed" })),
});

export const LightningTournamentDetailSchema = t.Object({
	...tournamentFields,
	players: t.Integer({ description: "Active entries" }),
	standings: t.Array(LightningStandingSchema, {
		description:
			"Live standings (score, wins, Buchholz, registration time) until completed, then the final results",
	}),
	watchable: t.Array(
		t.Object({
			reservationId: t.String(),
			roomId: t.Integer({ description: "Join as a spectator with `w,<roomId>`" }),
			startedAt: t.Nullable(DateTime("Null while the room is still in its lobby")),
			players: t.Array(PlayerRefSchema, { minItems: 2, maxItems: 2 }),
		}),
	),
});

export const MyLightningStateSchema = t.Object({
	tournament: LightningTournamentSchema,
	players: t.Integer({ description: "Active entries" }),
	entry: t.Nullable(LightningEntrySchema),
	state: t.Nullable(LightningPresenceSchema),
	game: t.Nullable(
		t.Object(
			{
				reservationId: t.String(),
				password: t.String({ description: "Room password to join the reserved duel with" }),
				seat: t.Union([t.Literal(0), t.Literal(1)]),
				roomId: t.Nullable(t.Integer({ description: "Null until the server opened the room" })),
				opponent: PlayerRefSchema,
			},
			{ description: "The pairing to play now; null when not paired" },
		),
	),
	lastGame: t.Nullable(
		t.Object(
			{
				reservationId: t.String(),
				resolution: literals(LIGHTNING_GAME_RESOLUTIONS),
				reason: t.Nullable(t.String()),
				outcome: literals(["win", "draw", "loss", "no_show", "void"] as const),
				opponent: PlayerRefSchema,
				appliedAt: t.Nullable(DateTime()),
			},
			{ description: "The player's latest resolved game while no game is pending" },
		),
	),
	position: t.Nullable(t.Integer({ description: "Place in the live standings" })),
});

export const LightningRankingListSchema = t.Array(
	t.Object({
		position: t.Integer(),
		userId: t.String(),
		username: t.String(),
		points: t.Integer(),
		tournamentsWon: t.Integer(),
		tournamentsPlayed: t.Integer(),
	}),
);

const Passcodes = (maxItems: number) => t.Array(t.Integer({ minimum: 1 }), { maxItems });

export const EnterLightningBodySchema = t.Object({
	deck: t.Object(
		{ main: Passcodes(60), extra: Passcodes(15), side: Passcodes(15) },
		{ description: "The lists the server will require at every duel of the tournament" },
	),
});

export const CreateLightningTournamentBodySchema = t.Object({
	name: t.String({ minLength: 1, maxLength: 80 }),
	format: LightningFormatSchema,
	season: t.Optional(t.Integer({ minimum: 1, description: "Defaults to the current season" })),
	registrationOpensAt: DateTime(),
	startsAt: DateTime(),
	endsAt: DateTime(),
	turnTimeSeconds: t.Optional(t.Integer({ minimum: 60, maximum: 998, description: "Default 90" })),
	lobbyTimeoutSeconds: t.Optional(t.Integer({ minimum: 1, description: "Default 90" })),
	minPlayers: t.Optional(t.Integer({ minimum: 2, description: "Default 4" })),
	maxPlayers: t.Optional(t.Integer({ minimum: 2, description: "Default 64" })),
	pointsByPosition: t.Optional(PrizeTableSchema),
	essenceByPosition: t.Optional(PrizeTableSchema),
});

export const CancelLightningTournamentBodySchema = t.Object({
	reason: t.String({ minLength: 1, maxLength: 200 }),
});
