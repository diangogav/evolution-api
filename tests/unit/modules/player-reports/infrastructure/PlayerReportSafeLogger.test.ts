import { expect, it } from "bun:test";
import type { LogLevel, LogMessage } from "typeorm";
import { PlayerReportSafeLogger } from "../../../../../src/modules/player-reports/infrastructure/PlayerReportSafeLogger";
class Capture extends PlayerReportSafeLogger {
	messages: string[] = [];
	protected override writeLog(_level: LogLevel, message: LogMessage | LogMessage[]): void {
		this.messages.push(JSON.stringify(message));
	}
}
it("redacts private report parameters and database errors on normal, slow and failed queries", () => {
	const logger = new Capture("all");
	const secret = "sensitive synthetic allegation and moderator note";
	for (const table of ["player_reports", "player_report_reviews"]) {
		const sql = `INSERT INTO ${table} (details) VALUES ($1)`;
		logger.logQuery(sql, [secret]);
		logger.logQuerySlow(100, sql, [secret]);
		logger.logQueryError(new Error(secret), sql, [secret]);
	}
	expect(logger.messages.length).toBe(6);
	expect(logger.messages.join("\n")).not.toContain(secret);
	expect(logger.messages.join("\n")).toContain("INSERT INTO player_reports");
	logger.logQuery("SELECT $1", ["ordinary fixture value"]);
	expect(logger.messages[logger.messages.length - 1]).toContain("ordinary fixture value");
});
