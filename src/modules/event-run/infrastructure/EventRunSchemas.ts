import { t } from "elysia";

import { WAVE_TIERS } from "../domain/EventDefinition";
import { EVENT_RUN_STATUSES } from "../domain/EventRun";

export const PrizeTierSchema = t.Object({
	wavesCleared: t.Integer({ description: "Waves cleared in one run that unlock this tier" }),
	essence: t.Integer({ description: "Essence credited the first time the tier is reached" }),
	cosmeticIds: t.Array(t.String(), { description: "Cosmetics granted with the tier" }),
});

export const EventViewSchema = t.Object({
	id: t.String(),
	name: t.String(),
	description: t.String(),
	open: t.Boolean({ description: "Whether runs can be started now" }),
	startsAt: t.String({ format: "date-time" }),
	endsAt: t.String({ format: "date-time" }),
	attemptsPerDay: t.Integer(),
	attemptsLeftToday: t.Integer({ description: "Runs the player can still start this UTC day" }),
	bestMark: t.Integer({ description: "Most waves the player cleared in any run" }),
	waves: t.Array(
		t.Object({
			wave: t.Integer(),
			tier: t.Union(WAVE_TIERS.map((tier) => t.Literal(tier))),
			pool: t.Array(t.String(), {
				description: "WindBot names the wave's rival is drawn from when the wave starts",
			}),
		}),
	),
	decks: t.Array(t.Object({ id: t.String(), name: t.String() })),
	prizeTiers: t.Array(PrizeTierSchema),
});

export const EventRunViewSchema = t.Object({
	id: t.String({ format: "uuid" }),
	eventId: t.String(),
	deckId: t.String(),
	status: t.Union(EVENT_RUN_STATUSES.map((status) => t.Literal(status))),
	currentWave: t.Integer({ description: "1-based wave to play next, or the last one played" }),
	totalWaves: t.Integer(),
	wavesCleared: t.Integer(),
	botName: t.Nullable(
		t.String({ description: "Rival drawn for the next wave; null once the run ended" }),
	),
	facedBots: t.Array(t.String(), { description: "Rivals of the waves cleared, in order" }),
	lostTo: t.Nullable(
		t.String({ description: "Rival the run lost to; null unless the run is lost" }),
	),
	voids: t.Integer({ description: "Duels the player left before they started" }),
	duelLive: t.Boolean({ description: "A duel of this run is being played right now" }),
});

export const EventDuelTicketSchema = t.Object({
	reservationId: t.String(),
	password: t.String({ description: "Room password to join the reserved duel with" }),
	wave: t.Integer(),
	botName: t.String(),
	deck: t.Object(
		{ main: t.Array(t.Integer()), extra: t.Array(t.Integer()), side: t.Array(t.Integer()) },
		{ description: "The deck the server requires for this duel, exactly" },
	),
});

export const RequestEventDuelResultSchema = t.Object({
	run: EventRunViewSchema,
	duel: t.Nullable(EventDuelTicketSchema),
});

export const MyEventRunSchema = t.Object({ run: t.Nullable(EventRunViewSchema) });
