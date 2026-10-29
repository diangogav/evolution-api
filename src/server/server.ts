import cors from "@elysiajs/cors";
import { Elysia } from "elysia";

import { AuthenticationError } from "../shared/errors/AuthenticationError";
import { ConflictError } from "../shared/errors/ConflictError";
import { ForbiddenError } from "../shared/errors/ForbiddenError";
import { PaymentRequiredError } from "../shared/errors/PaymentRequiredError";
import { UnprocessableError } from "../shared/errors/UnprocessableError";
import { InvalidArgumentError } from "../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../shared/errors/NotFoundError";
import { config } from "../config";
import { buildCommunityDecksWorker } from "../modules/community-decks/infrastructure/buildCommunityDecks";
import { buildEventRunWorker } from "../modules/event-run/infrastructure/buildEventRun";
import { Logger } from "../shared/logger/domain/Logger";

import { achievementsRouter, userAchievementsRouter } from "./routes/achievements-router";
import { banListRouter } from "./routes/ban-list-router";
import { communityDecksRouter } from "./routes/community-decks-router";
import { cosmeticsRouter } from "./routes/cosmetics-router";
import { leaderboardRouter } from "./routes/leaderboard-router";
import { emoteBarRouter } from "./routes/emote-bar-router";
import { botLoadoutRouter } from "./routes/bot-loadout-router";
import { eventRunsRouter, eventsRouter } from "./routes/event-run-router";
import { loadoutRouter } from "./routes/loadout-router";
import { meCosmeticsRouter } from "./routes/me-cosmetics-router";
import { missionsRouter } from "./routes/missions-router";
import { essenceRouter, shopRouter } from "./routes/shop-router";
import { publicEmoteBarRouter } from "./routes/public-emote-bar-router";
import { publicLoadoutRouter } from "./routes/public-loadout-router";
import { rankedTiersRouter } from "./routes/ranked-tiers-router";
import { adminCosmeticsRouter } from "./routes/admin-cosmetics-router";
import { adminModerationRouter } from "./routes/admin-moderation-router";
import { adminStatsRouter } from "./routes/admin-stats-router";
import { statsRouter } from "./routes/stats-router";
import { ticketRouter } from "./routes/ticket-router";
import { userRouter } from "./routes/user-router";
import { createSwagger } from "./swagger";

type ErrorHookContext = { error: unknown; set: { status?: number | string } };

export function mapDomainErrorStatus({ error, set }: ErrorHookContext): void {
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

	if (error instanceof ForbiddenError) {
		set.status = 403;
	}

	if (error instanceof UnprocessableError) {
		set.status = 422;
	}

	if (error instanceof PaymentRequiredError) {
		set.status = 402;
	}
}

export class Server {
	private readonly app: Elysia;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.app = new Elysia().use(cors()).use(createSwagger()).onError(mapDomainErrorStatus);

		mountApiV1Routes(this.app);
		this.logger = logger;
	}

	start(): void {
		// The event run worker applies duel results nobody fetched and voids stale duels.
		if (config.eventRunWorker.enabled) buildEventRunWorker(this.logger).start();
		// The community decks worker syncs YGOPRODeck decks once per interval.
		if (config.communityDecksWorker.enabled) buildCommunityDecksWorker(this.logger).start();
		this.app.listen(process.env.PORT ?? 3000, () => {
			this.logger.info(`Server started on port ${process.env.PORT ?? 3000}!`);
		});
	}
}

export function mountApiV1Routes(app: Elysia) {
	// @ts-expect-error linter not config correctly
	return app.group("/api/v1", (group: Elysia) => {
		return group
			.use(userRouter)
			.use(achievementsRouter)
			.use(userAchievementsRouter)
			.use(leaderboardRouter)
			.use(rankedTiersRouter)
			.use(banListRouter)
			.use(statsRouter)
			.use(ticketRouter)
			.use(cosmeticsRouter)
			.use(meCosmeticsRouter)
			.use(emoteBarRouter)
			.use(loadoutRouter)
			.use(publicLoadoutRouter)
			.use(botLoadoutRouter)
			.use(publicEmoteBarRouter)
			.use(adminCosmeticsRouter)
			.use(adminModerationRouter)
			.use(adminStatsRouter)
			.use(missionsRouter)
			.use(essenceRouter)
			.use(shopRouter)
			.use(eventsRouter)
			.use(eventRunsRouter)
			.use(communityDecksRouter);
	});
}
