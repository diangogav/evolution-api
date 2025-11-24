import cors from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import { Elysia } from "elysia";

import { AuthenticationError } from "../shared/errors/AuthenticationError";
import { ConflictError } from "../shared/errors/ConflictError";
import { InvalidArgumentError } from "../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../shared/errors/NotFoundError";
import { Logger } from "../shared/logger/domain/Logger";

import { banListRouter } from "./routes/ban-list-router";
import { leaderboardRouter } from "./routes/leaderboard-router";
import { lightningTournamentRouter } from "./routes/lightning-tournament-router";
import { tournamentsProxyRouter } from "./routes/tournaments-proxy-router";
import { userRouter } from "./routes/user-router";

export class Server {
	private readonly app: Elysia;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.app = new Elysia()
			.use(cors())
			.use(swagger({
				documentation: {
					info: {
						title: 'Evolution API - Tournaments',
						version: '1.0.0',
						description: 'API for managing tournaments, matches, participants, and leaderboards'
					},
					tags: [
						{
							name: 'Authentication',
							description: 'User authentication and registration endpoints'
						},
						{
							name: 'User Management',
							description: 'User profile and account management'
						},
						{
							name: 'User Bans',
							description: 'User ban management (Admin only)'
						},
						{
							name: 'Leaderboard',
							description: 'Rankings and statistics endpoints'
						},
						{
							name: 'Ban Lists',
							description: 'Game ban list information'
						},
						{
							name: 'Lightning Tournaments',
							description: 'Lightning tournament management and enrollment'
						},
						{
							name: 'Players & Participants',
							description: 'Endpoints for querying player and participant information'
						},
						{
							name: 'Bracket Management',
							description: 'Endpoints for generating and retrieving tournament brackets'
						},
						{
							name: 'Match Management',
							description: 'Endpoints for managing match results and match data'
						},
						{
							name: 'Tournament Lifecycle',
							description: 'Endpoints for managing tournament state transitions (publish, start, complete, cancel)'
						},
						{
							name: 'Participant Management',
							description: 'Endpoints for managing tournament participants and entries'
						}
					],
					components: {
						securitySchemes: {
							bearerAuth: {
								type: 'http',
								scheme: 'bearer',
								bearerFormat: 'JWT',
								description: 'JWT token obtained from authentication endpoint'
							}
						}
					}
				}
			}))
			.onError(({ error, set }) => {
				if (error instanceof ConflictError) {
					set.status = 409;
				}

				if (error instanceof AuthenticationError) {
					set.status = 401;
				}

				if (error instanceof NotFoundError) {
					set.status = 404;
				}

				if (error instanceof InvalidArgumentError) {
					set.status = 400;
				}
			});

		// @ts-expect-error linter not config correctly
		this.app.group("/api/v1", (app: Elysia) => {
			return app
				.use(userRouter)
				.use(leaderboardRouter)
				.use(banListRouter)
				.use(lightningTournamentRouter)
				.use(tournamentsProxyRouter);
		});
		this.logger = logger;
	}

	start(): void {
		this.app.listen(process.env.PORT ?? 3000, () =>
			this.logger.info(`Server started on port ${process.env.PORT ?? 3000}`),
		);
	}
}
