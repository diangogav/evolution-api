import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { GetEvent } from "../../modules/event-run/application/GetEvent";
import { GetMyEventRun } from "../../modules/event-run/application/GetMyEventRun";
import { RequestEventDuel } from "../../modules/event-run/application/RequestEventDuel";
import { StartEventRun } from "../../modules/event-run/application/StartEventRun";
import { BunRedisReservationStore } from "../../modules/event-run/infrastructure/BunRedisReservationStore";
import { buildApplyReservedDuel } from "../../modules/event-run/infrastructure/buildEventRun";
import { EventAttemptPostgresRepository } from "../../modules/event-run/infrastructure/EventAttemptPostgresRepository";
import { EventCatalogPostgresRepository } from "../../modules/event-run/infrastructure/EventCatalogPostgresRepository";
import { EventDuelPostgresRepository } from "../../modules/event-run/infrastructure/EventDuelPostgresRepository";
import { EventRunPostgresRepository } from "../../modules/event-run/infrastructure/EventRunPostgresRepository";
import {
	EventRunViewSchema,
	EventViewSchema,
	MyEventRunSchema,
	RequestEventDuelResultSchema,
} from "../../modules/event-run/infrastructure/EventRunSchemas";
import { resolveLocale } from "../../modules/rewards/domain/LocalizedText";
import { CosmeticsTransactionRunner } from "../../modules/rewards/infrastructure/CosmeticsTransactionRunner";
import { JWT } from "../../shared/JWT";
import { redisClient } from "../../shared/redis/redisClient";
import { banGuard } from "../guards/bandGuard";
import { ErrorSchema, errorResponses, jsonOk } from "../openapi/responses";

const jwt = new JWT(config.jwt);
const catalog = new EventCatalogPostgresRepository();
const runs = new EventRunPostgresRepository();
const attempts = new EventAttemptPostgresRepository();
const duels = new EventDuelPostgresRepository();
const reservations = new BunRedisReservationStore(redisClient);
const applyDuel = buildApplyReservedDuel();
const transactions = new CosmeticsTransactionRunner();

const getEvent = new GetEvent(catalog, runs, attempts);
const startEventRun = new StartEventRun(
	catalog,
	runs,
	attempts,
	reservations,
	applyDuel,
	transactions,
);
const requestEventDuel = new RequestEventDuel(
	catalog,
	runs,
	duels,
	reservations,
	applyDuel,
	transactions,
);
const getMyEventRun = new GetMyEventRun(catalog, runs, reservations, applyDuel, transactions);

const userIdOf = (token: unknown) => (jwt.decode(token as string) as { id: string }).id;

const runExample = {
	id: "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b",
	eventId: "halloween-2026",
	deckId: "necromancer",
	status: "ready",
	currentWave: 2,
	totalWaves: 8,
	wavesCleared: 1,
	botName: "Skeletons",
	facedBots: ["Haunted"],
	lostTo: null,
	voids: 0,
	duelLive: false,
};

const conflict = (description: string) => ({
	409: { description, content: { "text/plain": { schema: ErrorSchema } } },
});

export const eventsRouter = new Elysia({ prefix: "/events" }).use(bearer()).guard(banGuard, (app) =>
	app
		.get(
			"/:eventId",
			({ bearer, params, request }) =>
				getEvent.run({
					userId: userIdOf(bearer),
					eventId: params.eventId,
					locale: resolveLocale(request.headers.get("accept-language") ?? undefined),
					now: new Date(),
				}),
			{
				params: t.Object({ eventId: t.String() }),
				detail: {
					tags: ["Rewards"],
					summary: "Get an event",
					description:
						"Returns an event gauntlet: its window, waves, decks and prize tiers, with the authenticated player's attempts left today (UTC) and best mark. Texts are localized from Accept-Language (en or es, default en).",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(EventViewSchema, "The event as the player sees it"),
						...errorResponses(401, 403, 404),
					},
				},
			},
		)
		.post(
			"/:eventId/runs",
			({ bearer, params, body }) =>
				startEventRun.run({
					userId: userIdOf(bearer),
					eventId: params.eventId,
					deckId: body.deckId,
					now: new Date(),
				}),
			{
				params: t.Object({ eventId: t.String() }),
				body: t.Object({ deckId: t.String({ description: "One of the event's deck ids" }) }),
				detail: {
					tags: ["Rewards"],
					summary: "Start an event run",
					description:
						"Starts a run at wave 1 with the chosen deck and spends one of today's attempts. A ready run the player already has is replaced, after its pending duel result is applied.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(EventRunViewSchema, "The new run", {
							...runExample,
							currentWave: 1,
							wavesCleared: 0,
							botName: "Haunted",
							facedBots: [],
						}),
						...errorResponses(401, 403, 404),
						...conflict("A duel of the current run is in progress"),
						422: {
							description: "No attempts left today, event closed, unknown deck, or invalid body",
							content: { "text/plain": { schema: ErrorSchema } },
						},
					},
				},
			},
		),
);

export const eventRunsRouter = new Elysia({ prefix: "/event-runs" })
	.use(bearer())
	.guard(banGuard, (app) =>
		app
			.get(
				"/me",
				({ bearer, query }) =>
					getMyEventRun.run({ userId: userIdOf(bearer), eventId: query.eventId, now: new Date() }),
				{
					query: t.Object({ eventId: t.String() }),
					detail: {
						tags: ["Rewards"],
						summary: "Get my event run",
						description:
							"Returns the player's current or last run of the event, after applying the result of its latest duel. `run` is null when the player never started one.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(MyEventRunSchema, "The current or last run", { run: runExample }),
							...errorResponses(401, 403, 404, 422),
						},
					},
				},
			)
			.post(
				"/:runId/duel",
				({ bearer, params }) =>
					requestEventDuel.run({ userId: userIdOf(bearer), runId: params.runId, now: new Date() }),
				{
					params: t.Object({ runId: t.String() }),
					detail: {
						tags: ["Rewards"],
						summary: "Request the next event duel",
						description:
							"Reserves the duel of the run's current wave and returns the room password and the deck the server requires. The previous duel's result is applied first; when it ended the run, `duel` is null and `run` shows the final state.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(
								RequestEventDuelResultSchema,
								"The reserved duel, or the run's final state",
								{
									run: runExample,
									duel: {
										reservationId: "Xy3kP9aQ2mNb7RtL",
										password: "rv#Xy3kP9aQ2mNb7RtL",
										wave: 2,
										botName: "Skeletons",
										deck: { main: [17259470], extra: [6021033], side: [] },
									},
								},
							),
							...errorResponses(401, 403, 404),
							...conflict("A duel of this run is in progress"),
						},
					},
				},
			),
	);
