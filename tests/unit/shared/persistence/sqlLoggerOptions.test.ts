import { describe, expect, it } from "bun:test";
import type { LogLevel, LogMessage } from "typeorm";

import { RedactingQueryLogger } from "../../../../src/shared/persistence/RedactingQueryLogger";
import { sqlLoggerOptions } from "../../../../src/shared/persistence/sqlLoggerOptions";

describe("sqlLoggerOptions", () => {
	it("logs every query when SQL_QUERY_LOGGING is true", () => {
		expect(sqlLoggerOptions("true")).toBe(true);
	});

	it("logs only errors, warnings and migrations when it is unset", () => {
		expect(sqlLoggerOptions(undefined)).toEqual(["error", "warn", "migration"]);
	});

	it("treats any other value as off", () => {
		expect(sqlLoggerOptions("false")).toEqual(["error", "warn", "migration"]);
		expect(sqlLoggerOptions("1")).toEqual(["error", "warn", "migration"]);
	});
});

describe("RedactingQueryLogger with the default SQL logging options", () => {
	class Capture extends RedactingQueryLogger {
		types: string[] = [];
		protected override writeLog(_level: LogLevel, message: LogMessage | LogMessage[]): void {
			for (const entry of Array.isArray(message) ? message : [message])
				this.types.push(String(entry.type));
		}
	}

	it("drops ordinary queries but still logs failed ones", () => {
		const logger = new Capture(sqlLoggerOptions(undefined), []);

		logger.logQuery("SELECT 1", []);
		logger.logQueryError(new Error("relation does not exist"), "SELECT * FROM missing", []);

		expect(logger.types).not.toContain("query");
		expect(logger.types).toContain("query-error");
	});

	it("logs ordinary queries when SQL_QUERY_LOGGING is true", () => {
		const logger = new Capture(sqlLoggerOptions("true"), []);

		logger.logQuery("SELECT 1", []);

		expect(logger.types).toContain("query");
	});
});
