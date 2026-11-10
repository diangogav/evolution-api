import { t } from "elysia";

import { LIGHTNING_CHAT_BODY_MAX_LENGTH } from "../domain/LightningChatMessage";
import { LIGHTNING_ENTRY_STATUSES, LIGHTNING_PRESENCES } from "../domain/LightningEntry";
import { LIGHTNING_GAME_RESOLUTIONS } from "../domain/LightningGame";
import {
	LIGHTNING_FORMATS,
	LIGHTNING_SYSTEMS,
	LIGHTNING_TOURNAMENT_STATUSES,
	LIVE_LIGHTNING_TOURNAMENT_STATUSES,
	MAX_ROUND_BREAK_SECONDS,
	MAX_ROUND_MINUTES,
	MAX_SWISS_ROUNDS,
	MIN_ROUND_MINUTES,
	MIN_SWISS_ROUNDS,
} from "../domain/LightningTournament";

const literals = <T extends string>(values: readonly T[]) =>
	t.Union(values.map((value) => t.Literal(value)));

const DateTime = (description?: string) => t.String({ format: "date-time", description });

export const LightningFormatSchema = literals(LIGHTNING_FORMATS);
export const LightningTournamentStatusSchema = literals(LIGHTNING_TOURNAMENT_STATUSES);
export const LightningPresenceSchema = literals(LIGHTNING_PRESENCES);
export const LightningSystemSchema = literals(LIGHTNING_SYSTEMS);

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
	startsAt: DateTime(
		"Pairing starts; an arena accepts late entries while running, Swiss closes entries here",
	),
	endsAt: DateTime(
		"Arena: no new pairings after this; games already live finish. Swiss: an estimate, startsAt + rounds × (round minutes + break); the last round closing ends it",
	),
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
	system: LightningSystemSchema,
	rounds: t.Nullable(
		t.Integer({
			description:
				"Swiss rounds, fixed at the start; null for an arena, and for a Swiss tournament computing them from the field at start",
		}),
	),
	currentRound: t.Integer({
		description: "The live (or last closed) Swiss round; 0 before round one and for an arena",
	}),
	roundEndsAt: t.Nullable(
		DateTime(
			"Deadline of the live Swiss round: unfinished games are then closed as draws. Null otherwise",
		),
	),
	nextRoundAt: t.Nullable(
		DateTime("When the next Swiss round is paired, during the break. Null otherwise"),
	),
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
	noShows: t.Integer({
		description: "Rooms missed; the third removes an arena entry, the second a Swiss one",
	}),
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

const SwissTableSchema = t.Object({
	reservationId: t.String({ description: "The table's latest reservation" }),
	seat0: PlayerRefSchema,
	seat1: PlayerRefSchema,
	resolution: t.Nullable(literals(LIGHTNING_GAME_RESOLUTIONS), {
		description: "Null while the game is being played",
	}),
	noShowSeats: t.Optional(
		t.Array(t.Integer({ minimum: 0, maximum: 1 }), {
			description:
				"Only on a `no_show`: the seats that missed the room; both seats is a double no-show",
		}),
	),
	roomId: t.Nullable(
		t.Integer({ description: "Join as a spectator with `w,<roomId>` while the game is live" }),
	),
});

export const SwissRoundSchema = t.Object(
	{
		number: t.Integer(),
		tables: t.Array(SwissTableSchema),
		bye: t.Nullable(PlayerRefSchema, { description: "The player with the bye (a win, +3)" }),
	},
	{ description: "The current (or last closed) Swiss round" },
);

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
	round: t.Nullable(SwissRoundSchema, {
		description: "The current (or last closed) Swiss round; null for an arena and before round one",
	}),
});

const MyLightningGameSchema = t.Object(
	{
		reservationId: t.String(),
		password: t.String({ description: "Room password to join the reserved duel with" }),
		seat: t.Union([t.Literal(0), t.Literal(1)]),
		roomId: t.Nullable(t.Integer({ description: "Null until the server opened the room" })),
		opponent: PlayerRefSchema,
	},
	{ description: "The pairing to play now; null when not paired" },
);

const LightningCeremonySchema = t.Object(
	{
		position: t.Integer({ minimum: 1, description: "Final position" }),
		players: t.Integer({ minimum: 1, description: "Ranked players in the final standings" }),
		score: t.Integer(),
		record: t.Object({ wins: t.Integer(), draws: t.Integer(), losses: t.Integer() }),
		pointsAwarded: t.Integer({ description: "Season points" }),
		essenceAwarded: t.Integer({ description: "Placement essence" }),
		achievements: t.Array(
			t.Object({
				code: t.String({ description: "Achievement catalog code, e.g. `LIGHTNING_CHAMPION`" }),
				name: t.String(),
				essenceReward: t.Integer({
					description: "Essence the achievement pays, on top of the placement essence",
				}),
			}),
			{ description: "Achievements this tournament unlocked" },
		),
	},
	{
		description:
			"The player's final result; null until the tournament is completed and for a player without a result",
	},
);

export const MyLightningStateSchema = t.Object({
	tournament: LightningTournamentSchema,
	players: t.Integer({ description: "Active entries" }),
	entry: t.Nullable(LightningEntrySchema),
	state: t.Nullable(LightningPresenceSchema),
	game: t.Nullable(MyLightningGameSchema),
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
	bye: t.Boolean({ description: "True when the player has the bye in the current Swiss round" }),
	ceremony: t.Nullable(LightningCeremonySchema),
});

export const ActiveLightningEntryListSchema = t.Array(
	t.Object({
		tournamentId: t.String({ format: "uuid" }),
		name: t.String(),
		system: LightningSystemSchema,
		status: literals(LIVE_LIGHTNING_TOURNAMENT_STATUSES),
		startsAt: DateTime(),
		state: LightningPresenceSchema,
		game: t.Nullable(MyLightningGameSchema),
		bye: t.Boolean({ description: "True when the player has the bye in the current Swiss round" }),
	}),
);

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
	endsAt: DateTime("Ignored for Swiss: the end is estimated from the rounds"),
	system: t.Optional(LightningSystemSchema),
	rounds: t.Optional(
		t.Nullable(
			t.Integer({
				minimum: MIN_SWISS_ROUNDS,
				maximum: MAX_SWISS_ROUNDS,
				description: "Swiss only; null or missing: max(3, ceil(log2(players))) at start",
			}),
		),
	),
	roundMinutes: t.Optional(
		t.Integer({
			minimum: MIN_ROUND_MINUTES,
			maximum: MAX_ROUND_MINUTES,
			description: "Swiss round deadline in minutes. Default 40",
		}),
	),
	roundBreakSeconds: t.Optional(
		t.Integer({
			minimum: 0,
			maximum: MAX_ROUND_BREAK_SECONDS,
			description: "Swiss break between rounds in seconds. Default 60",
		}),
	),
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

export const LightningChatMessageSchema = t.Object({
	id: t.Integer({ description: "Strictly increasing; also the SSE event id" }),
	tournamentId: t.String({ format: "uuid" }),
	author: t.Object({
		userId: t.String(),
		username: t.String(),
		admin: t.Boolean({ description: "The author holds the admin role now" }),
	}),
	body: t.String(),
	createdAt: DateTime(),
});

export const DeletedLightningChatMessageSchema = t.Object(
	{ id: t.Integer(), deleted: t.Literal(true) },
	{ description: "A message an admin hid: drop it by id" },
);

export const LightningChatHistorySchema = t.Array(
	t.Union([LightningChatMessageSchema, DeletedLightningChatMessageSchema]),
	{ description: "Oldest first" },
);

export const PostLightningChatBodySchema = t.Object({
	body: t.String({
		maxLength: LIGHTNING_CHAT_BODY_MAX_LENGTH,
		description: "1-200 characters after trimming, no control characters",
	}),
});
