import { Elysia, t } from "elysia";

import {
	AdventCalendarViewSchema,
	RecoverDoorResultSchema,
	RequestDoorDuelResultSchema,
	RollRuneDieResultSchema,
} from "../../modules/advent-calendar/infrastructure/AdventCalendarSchemas";
import { resolveLocale } from "../../modules/rewards/domain/LocalizedText";
import { requireUser } from "../auth/requireUser";
import { buildAdventCalendar } from "../composition/buildAdventCalendar";
import { ErrorSchema, errorResponses, jsonOk } from "../openapi/responses";

const { getCalendar, requestDoorDuel, rollRuneDie, recoverDoor } = buildAdventCalendar();

const doorParams = t.Object({
	calendarId: t.String(),
	day: t.Integer({ minimum: 1, description: "1-based day of the calendar" }),
});

const doorExample = {
	day: 5,
	status: "open",
	botName: "FrostSentinel",
	prize: { essence: 50, cosmeticIds: [] },
	attempts: 0,
	firstTry: false,
	recovered: false,
	dieRoll: null,
	dieBonus: null,
	canRoll: false,
	duelLive: false,
};

const clearedDoorExample = {
	...doorExample,
	status: "cleared",
	attempts: 1,
	firstTry: true,
	dieRoll: 3,
	dieBonus: { essence: 30, cosmeticIds: [] },
};

const conflict = (description: string) => ({
	409: { description, content: { "text/plain": { schema: ErrorSchema } } },
});

const unprocessable = (description: string) => ({
	422: { description, content: { "text/plain": { schema: ErrorSchema } } },
});

export const adventCalendarsRouter = new Elysia({ prefix: "/advent-calendars" }).guard({}, (app) =>
	app
		.use(requireUser)
		.get(
			"/:calendarId",
			({ userId, params, request }) =>
				getCalendar.run({
					userId,
					calendarId: params.calendarId,
					locale: resolveLocale(request.headers.get("accept-language") ?? undefined),
					now: new Date(),
				}),
			{
				params: t.Object({ calendarId: t.String() }),
				detail: {
					tags: ["Rewards"],
					summary: "Get an advent calendar",
					description:
						"Returns an advent calendar with the authenticated player's state on each of its doors, after applying the results of the player's finished duels. A door opens at 00:00 UTC of its day. Texts are localized from Accept-Language (en or es, default en).",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(AdventCalendarViewSchema, "The calendar as the player sees it"),
						...errorResponses(401, 403, 404),
					},
				},
			},
		)
		.post(
			"/:calendarId/doors/:day/duel",
			({ userId, params, body }) =>
				requestDoorDuel.run({
					userId,
					calendarId: params.calendarId,
					day: params.day,
					deckId: body.deckId,
					now: new Date(),
				}),
			{
				params: doorParams,
				body: t.Object({ deckId: t.String({ description: "One of the calendar's deck ids" }) }),
				detail: {
					tags: ["Rewards"],
					summary: "Request a door duel",
					description:
						"Reserves the duel against the door's sentinel and returns the room password and the deck the server requires. The door's previous duel is applied first; when that duel cleared the door, `duel` is null. Losing never closes a door: an open door can be requested again.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(RequestDoorDuelResultSchema, "The reserved duel, or the cleared door", {
							door: doorExample,
							duel: {
								reservationId: "Xy3kP9aQ2mNb7RtL",
								password: "rv#Xy3kP9aQ2mNb7RtL",
								day: 5,
								botName: "FrostSentinel",
								deck: { main: [17259470], extra: [6021033], side: [] },
							},
						}),
						...errorResponses(401, 403, 404),
						...conflict("A duel of this door is in progress"),
						...unprocessable(
							"Calendar closed, door not open yet, missed door not recovered, unknown deck, or invalid request",
						),
					},
				},
			},
		)
		.post(
			"/:calendarId/doors/:day/roll",
			({ userId, params }) =>
				rollRuneDie.run({
					userId,
					calendarId: params.calendarId,
					day: params.day,
					now: new Date(),
				}),
			{
				params: doorParams,
				detail: {
					tags: ["Rewards"],
					summary: "Roll a cleared door's bonus die",
					description:
						"Rolls the door's bonus die on the server and pays its bonus: faces 1 to 5 pay essence, a 6 pays the calendar's rare prize. A door has one roll; asking again returns the same face and pays nothing more.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(RollRuneDieResultSchema, "The door's roll and its bonus", {
							door: clearedDoorExample,
							roll: 3,
							bonus: { essence: 30, cosmeticIds: [] },
							balance: 180,
						}),
						...errorResponses(401, 403, 404, 422),
						...conflict("The door is not cleared yet"),
					},
				},
			},
		)
		.post(
			"/:calendarId/doors/:day/recover",
			({ userId, params }) =>
				recoverDoor.run({
					userId,
					calendarId: params.calendarId,
					day: params.day,
					now: new Date(),
				}),
			{
				params: doorParams,
				detail: {
					tags: ["Rewards"],
					summary: "Recover a missed door",
					description:
						"Reopens a past door the player never cleared, charging the calendar's recovery price in essence. The charge and the reopening are atomic, and a door is charged at most once.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(RecoverDoorResultSchema, "The reopened door and the new balance", {
							door: { ...doorExample, day: 3, recovered: true },
							balance: 70,
						}),
						...errorResponses(401, 402, 403, 404),
						...conflict("The door is not missed"),
						...unprocessable("Calendar closed, or invalid request"),
					},
				},
			},
		),
);
