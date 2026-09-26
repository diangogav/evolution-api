import cors from "@elysiajs/cors";
import { Elysia } from "elysia";

import { AuthenticationError } from "../shared/errors/AuthenticationError";
import { ConflictError } from "../shared/errors/ConflictError";
import { ForbiddenError } from "../shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../shared/errors/NotFoundError";
import { Logger } from "../shared/logger/domain/Logger";

import { banListRouter } from "./routes/ban-list-router";
import { cosmeticsRouter } from "./routes/cosmetics-router";
import { leaderboardRouter } from "./routes/leaderboard-router";
import { loadoutRouter } from "./routes/loadout-router";
import { meCosmeticsRouter } from "./routes/me-cosmetics-router";
import { publicLoadoutRouter } from "./routes/public-loadout-router";
import { rankedTiersRouter } from "./routes/ranked-tiers-router";
import { adminCosmeticsRouter } from "./routes/admin-cosmetics-router";
import { adminModerationRouter } from "./routes/admin-moderation-router";
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
			.use(leaderboardRouter)
			.use(rankedTiersRouter)
			.use(banListRouter)
			.use(statsRouter)
			.use(ticketRouter)
			.use(cosmeticsRouter)
			.use(meCosmeticsRouter)
			.use(loadoutRouter)
			.use(publicLoadoutRouter)
			.use(adminCosmeticsRouter)
			.use(adminModerationRouter);
	});
}
