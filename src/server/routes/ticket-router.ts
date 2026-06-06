import { bearer } from "@elysiajs/bearer";
import { RedisClient } from "bun";
import { Elysia } from "elysia";

import { config } from "../../config";
import { IssueGameTicket } from "../../modules/ticket/application/IssueGameTicket";
import { BunRedisRankedTicketRepository } from "../../modules/ticket/infrastructure/BunRedisRankedTicketRepository";
import { JWT } from "../../shared/JWT";
import { banGuard } from "../guards/bandGuard";

const jwt = new JWT(config.jwt);
const redisClient = new RedisClient(config.redis.url);
const rankedTicketRepository = new BunRedisRankedTicketRepository(redisClient);

export const ticketRouter = new Elysia({ prefix: "/game-tickets" })
	.use(bearer())
	.guard(banGuard, (app) =>
		app.post(
			"/",
			async ({ bearer }) => {
				const { id } = jwt.decode(bearer as string) as { id: string };
				return new IssueGameTicket(rankedTicketRepository).issue({ userId: id });
			},
			{
				detail: {
					tags: ["Ranked"],
					summary: "Issue ranked game ticket",
					description: "Issues a single-use ticket for the authenticated user to join a ranked game",
					security: [{ bearerAuth: [] }],
					responses: {
						200: {
							description: "Ticket issued successfully",
							content: {
								"application/json": {
									example: { ticket: "550e8400-e29b-41d4-a716-446655440000" },
								},
							},
						},
						401: { description: "Invalid or missing token" },
						403: { description: "User is banned" },
					},
				},
			},
		),
	);
