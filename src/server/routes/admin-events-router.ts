import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { EventCatalogPostgresRepository } from "../../modules/event-run/infrastructure/EventCatalogPostgresRepository";
import { GetEventStats } from "../../modules/event-stats/application/GetEventStats";
import { ListAdminEvents } from "../../modules/event-stats/application/ListAdminEvents";
import { EventStatsPostgresRepository } from "../../modules/event-stats/infrastructure/EventStatsPostgresRepository";
import {
	AdminEventListSchema,
	EventStatsSchema,
} from "../../modules/event-stats/infrastructure/EventStatsSchemas";
import { JWT } from "../../shared/JWT";
import type { AdminAuthorizer } from "../auth/AdminAuthorizer";
import { JwtAdminAuthorizer } from "../auth/AdminAuthorizer";
import { errorResponses, jsonOk } from "../openapi/responses";

export interface AdminEventsRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly listAdminEvents: Pick<ListAdminEvents, "run">;
	readonly getEventStats: Pick<GetEventStats, "run">;
	readonly clock: () => Date;
}

const EVENT_EXAMPLE = {
	id: "halloween-2026",
	name: "Halloween",
	startsAt: "2026-10-28T00:00:00.000Z",
	endsAt: "2026-11-08T00:00:00.000Z",
	waves: 8,
};

export function createAdminEventsRouter(deps: AdminEventsRouterDependencies) {
	return new Elysia({ prefix: "/admin/events" })
		.use(bearer())
		.get(
			"/",
			({ bearer: token }) => {
				deps.authorizer.requireAdmin(token);
				return deps.listAdminEvents.run();
			},
			{
				detail: {
					tags: ["Event Stats"],
					summary: "List every event",
					description:
						"Every event in the catalog, newest start first, with its Spanish name (English when it has none) and its number of waves.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(AdminEventListSchema, "Catalog events, newest start first", [
							EVENT_EXAMPLE,
						]),
						...errorResponses(401, 403),
					},
				},
			},
		)
		.get(
			"/:eventId/stats",
			({ bearer: token, params }) => {
				deps.authorizer.requireAdmin(token);
				return deps.getEventStats.run({ eventId: params.eventId, now: deps.clock() });
			},
			{
				params: t.Object({ eventId: t.String() }),
				detail: {
					tags: ["Event Stats"],
					summary: "Stats of one event",
					description:
						"Run totals per status, runs and players per UTC day, the wave funnel, per deck usage and success, duel outcomes and a per player table for one event.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(EventStatsSchema, "Event stats", {
							event: EVENT_EXAMPLE,
							totals: {
								players: 7,
								runs: 19,
								completedRuns: 0,
								inProgressRuns: 1,
								lostRuns: 18,
								expiredRuns: 0,
								supersededRuns: 0,
							},
							daily: [
								{ date: "2026-10-28", runs: 0, players: 0 },
								{ date: "2026-10-29", runs: 19, players: 7 },
							],
							waveFunnel: [
								{ wave: 1, runsCleared: 11 },
								{ wave: 2, runsCleared: 10 },
							],
							decks: [
								{
									deckId: "necromancer",
									deckName: "Necromancer",
									runs: 10,
									players: 6,
									completedRuns: 0,
									bestWavesCleared: 7,
									avgWavesCleared: 2.4,
								},
							],
							duels: { wins: 39, losses: 18, playerVoids: 5, other: 0 },
							players: [
								{
									userId: "6f1c2a9e-0d4b-4c1e-9a57-3b2d8e7f6a10",
									username: "Chazz_666",
									runs: 4,
									bestWavesCleared: 7,
									deckIds: ["dark-world", "necromancer"],
									inProgress: false,
									lastActivityAt: "2026-10-29T14:40:36.567Z",
								},
							],
						}),
						...errorResponses(401, 403, 404, 422),
					},
				},
			},
		);
}

const eventCatalog = new EventCatalogPostgresRepository();

export const adminEventsRouter = createAdminEventsRouter({
	authorizer: new JwtAdminAuthorizer(new JWT(config.jwt)),
	listAdminEvents: new ListAdminEvents(eventCatalog),
	getEventStats: new GetEventStats(eventCatalog, new EventStatsPostgresRepository()),
	clock: () => new Date(),
});
