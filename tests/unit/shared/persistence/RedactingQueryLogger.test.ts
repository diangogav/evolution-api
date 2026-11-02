import { describe, expect, it } from "bun:test";
import type { LogLevel, LogMessage } from "typeorm";
import { RedactingQueryLogger } from "../../../../src/shared/persistence/RedactingQueryLogger";

class Capture extends RedactingQueryLogger {
	messages: (Omit<LogMessage, "message"> & { message: unknown })[] = [];
	protected override writeLog(_level: LogLevel, message: LogMessage | LogMessage[]): void {
		this.messages.push(...(Array.isArray(message) ? message : [message]));
	}
}

describe("RedactingQueryLogger", () => {
	it("redacts configured table parameters on normal, slow and failed queries", () => {
		const logger = new Capture("all", [
			"player_reports",
			"player_report_reviews",
			"private_ledger",
		]);
		const secret = "sensitive synthetic allegation and moderator note";
		for (const table of ["player_reports", 'public."PLAYER_REPORT_REVIEWS"', "private_ledger"]) {
			const sql = `INSERT INTO ${table} (details) VALUES ($1)`;
			logger.logQuery(sql, [secret]);
			logger.logQuerySlow(100, sql, [secret]);
			logger.logQueryError(new Error("check constraint failed"), sql, [secret]);
		}
		expect(logger.messages).toHaveLength(15);
		expect(JSON.stringify(logger.messages)).not.toContain(secret);
		expect(JSON.stringify(logger.messages)).toContain("INSERT INTO player_reports");
		expect(JSON.stringify(logger.messages)).toContain("sensitive query parameters redacted");
	});

	it("passes the original Error to the parent for private and ordinary queries", () => {
		const logger = new Capture("all", ["player_reports"]);
		const error = Object.assign(new Error("duplicate key violates unique constraint"), {
			code: "23505",
			constraint: "fixture_unique",
			detail: "fixture driver detail",
		});
		for (const sql of [
			"SELECT * FROM cosmetics WHERE id=$1",
			"INSERT INTO player_reports VALUES ($1)",
		]) {
			logger.logQueryError(error, sql, ["parameter"]);
			expect(logger.messages[logger.messages.length - 1]?.message).toBe(error);
			expect(logger.messages[logger.messages.length - 1]?.message).toBeInstanceOf(Error);
		}
		expect(error.stack).toContain("duplicate key");
		expect(error.detail).toBe("fixture driver detail");
		logger.logQueryError("driver string diagnostic", "SELECT 1");
		expect(logger.messages[logger.messages.length - 1]?.message).toBe("driver string diagnostic");
	});

	it("preserves ordinary parameters, exact table matching and the configured logging level", () => {
		const parameters = ["ordinary fixture value"];
		const logger = new Capture("all", ["player_reports"]);
		logger.logQuery("SELECT $1 FROM player_reports_archive", parameters);
		expect(logger.messages[0].parameters).toBe(parameters);
		const quiet = new Capture(false, ["player_reports"]);
		quiet.logQuery("SELECT * FROM player_reports", parameters);
		quiet.logQueryError(new Error("fixture failure"), "SELECT 1", parameters);
		expect(quiet.messages).toHaveLength(0);
	});
});
