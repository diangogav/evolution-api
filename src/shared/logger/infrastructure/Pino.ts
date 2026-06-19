import pino from "pino";

import { Logger } from "../domain/Logger";

export class Pino implements Logger {
	private readonly logger = pino({
		level: "debug",
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
			},
		},
	});

	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for file logging, currently disabled (see commented calls in log methods)
	private readonly fileLogger = pino({
		level: "debug",
		transport: {
			target: "pino/file",
			options: { destination: "app.log" },
		},
	});

	debug(message: unknown): void {
		this.logger.debug(message);
		// this.fileLogger.debug(message);
	}

	error(error: string | Error): void {
		this.logger.error(error);
		// this.fileLogger.error(error);
	}

	info(message: unknown): void {
		this.logger.info(message);
		// this.fileLogger.info(message);
	}
}
