import { Elysia } from "elysia";

import { requireUser } from "../auth/requireUser";
import { IssueGameTicket } from "../../modules/ticket/application/IssueGameTicket";
import { BunRedisRankedTicketRepository } from "../../modules/ticket/infrastructure/BunRedisRankedTicketRepository";
import { GameTicketSchema } from "../../modules/ticket/infrastructure/TicketSchemas";
import { redisClient } from "../../shared/redis/redisClient";
import { errorResponses, jsonOk } from "../openapi/responses";

const rankedTicketRepository = new BunRedisRankedTicketRepository(redisClient);

export const ticketRouter = new Elysia({ prefix: "/game-tickets" }).guard({}, (app) =>
	app.use(requireUser).post(
		"/",
		async ({ userId }) => {
			return new IssueGameTicket(rankedTicketRepository).issue({ userId });
		},
		{
			detail: {
				tags: ["Ranked"],
				summary: "Issue ranked game ticket",
				description: "Issues a single-use ticket for the authenticated user to join a ranked game",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(GameTicketSchema, "Ticket issued successfully", {
						ticket: "550e8400-e29b-41d4-a716-446655440000",
					}),
					...errorResponses(401, 403),
				},
			},
		},
	),
);
