import { Elysia } from "elysia";

import { AuthenticationError } from "../shared/errors/AuthenticationError";
import { ConflictError } from "../shared/errors/ConflictError";
import { InvalidArgumentError } from "../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../shared/errors/NotFoundError";
import { Logger } from "../shared/logger/domain/Logger";

import { userRouter } from "./routes/user-router";

export class Server {
	private readonly app: Elysia;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.app = new Elysia().onError(({ error, set }) => {
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

			return error;
		});

		// @ts-expect-error linter not config correctly
		this.app.group("/api/v1", (app: Elysia) => {
			return app.use(userRouter);
		});
		this.logger = logger;
	}

	start(): void {
		this.app.listen(process.env.PORT ?? 3000, () =>
			this.logger.info(`Server started on port ${process.env.PORT ?? 3000}`),
		);
	}
}
