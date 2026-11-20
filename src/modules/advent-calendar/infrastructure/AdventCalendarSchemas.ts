import { t } from "elysia";

import { CosmeticType } from "../../catalog";
import { DOOR_STATUSES } from "../domain/DoorProgress";

export const AdventPrizeSchema = t.Object({
	essence: t.Integer({ description: "Essence credited, 0 when the prize has none" }),
	cosmeticIds: t.Array(t.String(), { description: "Cosmetics granted with the prize" }),
});

export const AdventCosmeticSchema = t.Object({
	id: t.String(),
	type: t.Enum(CosmeticType),
	name: t.String({ description: "Catalog display name" }),
	assets: t.Record(t.String(), t.String(), {
		description: "Signed URLs keyed by file name (render.jpg, background.webp, ...)",
	}),
	assetsExpiresAt: t.Optional(
		t.Union([t.String(), t.Null()], {
			description:
				"ISO 8601 expiry of the signed asset URLs, or null when they are public and never expire",
		}),
	),
});

export const DoorViewSchema = t.Object({
	day: t.Integer({ description: "1-based day of the calendar" }),
	status: t.Union(
		DOOR_STATUSES.map((status) => t.Literal(status)),
		{
			description:
				"locked: its day has not come. open: playable (today's door or a recovered one). missed: a past day never cleared. cleared: won.",
		},
	),
	botName: t.String({ description: "WindBot guarding the door" }),
	prize: AdventPrizeSchema,
	attempts: t.Integer({
		description: "Duels that counted: wins, losses and duels left before they started",
	}),
	firstTry: t.Boolean({ description: "Cleared on the first counted duel" }),
	recovered: t.Boolean({ description: "Reopened with essence after its day passed" }),
	dieRoll: t.Nullable(
		t.Integer({ description: "Face of the bonus die, 1 to 6; null until rolled" }),
	),
	dieBonus: t.Nullable(AdventPrizeSchema),
	canRoll: t.Boolean({ description: "Cleared and not rolled yet" }),
	duelLive: t.Boolean({ description: "A duel of this door is being played right now" }),
});

export const AdventCalendarViewSchema = t.Object({
	id: t.String(),
	name: t.String(),
	description: t.String(),
	format: t.String(),
	open: t.Boolean({ description: "Whether doors can be played or recovered now" }),
	startsAt: t.String({ format: "date-time" }),
	endsAt: t.String({ format: "date-time" }),
	today: t.Integer({
		description:
			"Current day of the calendar: 0 before it starts, and above the last door once its day has passed",
	}),
	nextDoorAt: t.Nullable(
		t.String({ format: "date-time", description: "When the next door opens (00:00 UTC)" }),
	),
	recoveryPrice: t.Integer({ description: "Essence charged to reopen one missed door" }),
	sealsBroken: t.Integer({ description: "Doors the player cleared" }),
	decks: t.Array(t.Object({ id: t.String(), name: t.String() })),
	die: t.Object({
		essence: t.Array(t.Integer(), { description: "Essence paid by faces 1 to 5, in order" }),
		rare: AdventPrizeSchema,
	}),
	doors: t.Array(DoorViewSchema),
	cosmetics: t.Array(AdventCosmeticSchema, {
		description:
			"Every cosmetic a door or the die can pay, once each; an id the catalog does not know is left out",
	}),
});

export const DoorDuelTicketSchema = t.Object({
	reservationId: t.String(),
	password: t.String({ description: "Room password to join the reserved duel with" }),
	day: t.Integer(),
	botName: t.String(),
	deck: t.Object(
		{ main: t.Array(t.Integer()), extra: t.Array(t.Integer()), side: t.Array(t.Integer()) },
		{ description: "The deck the server requires for this duel, exactly" },
	),
});

export const RequestDoorDuelResultSchema = t.Object({
	door: DoorViewSchema,
	duel: t.Nullable(DoorDuelTicketSchema),
});

export const RollRuneDieResultSchema = t.Object({
	door: DoorViewSchema,
	roll: t.Integer({ minimum: 1, maximum: 6 }),
	bonus: AdventPrizeSchema,
	balance: t.Integer({ description: "The player's essence after the bonus" }),
});

export const RecoverDoorResultSchema = t.Object({
	door: DoorViewSchema,
	balance: t.Integer({ description: "The player's essence after the charge" }),
});
