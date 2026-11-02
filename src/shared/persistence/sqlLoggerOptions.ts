import type { LoggerOptions } from "typeorm";

// Every SQL statement is logged only when SQL_QUERY_LOGGING is "true" (local
// debugging). Otherwise only errors, warnings and migrations reach the log, so
// production does not print each query.
export function sqlLoggerOptions(flag: string | undefined): LoggerOptions {
	return flag === "true" ? true : ["error", "warn", "migration"];
}
