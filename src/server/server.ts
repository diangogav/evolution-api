import { Elysia } from "elysia";

import { Logger } from "../shared/logger/domain/Logger";

import { userRouter } from "./routes/user-router";

export class Server {
	private readonly app: Elysia;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.app = new Elysia();
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
