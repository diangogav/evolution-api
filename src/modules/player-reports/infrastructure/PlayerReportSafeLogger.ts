import { AdvancedConsoleLogger, type QueryRunner } from "typeorm";

const privateQuery = (query: string) => /\bplayer_reports\b|\bplayer_report_reviews\b/i.test(query);
const redacted = ["[private player report parameters redacted]"];
// Preserve SQL diagnostics for the existing DataSource without copying private
// allegations, match snapshots or moderator notes into general query/error logs.
export class PlayerReportSafeLogger extends AdvancedConsoleLogger {
	override logQuery(query: string, parameters?: unknown[], runner?: QueryRunner): void {
		super.logQuery(query, privateQuery(query) ? redacted : parameters, runner);
	}
	override logQueryError(
		error: string | Error,
		query: string,
		parameters?: unknown[],
		runner?: QueryRunner,
	): void {
		if (privateQuery(query))
			super.logQueryError(
				"Player report query failed; private database detail redacted",
				query,
				redacted,
				runner,
			);
		else super.logQueryError(String(error), query, parameters, runner);
	}
	override logQuerySlow(
		time: number,
		query: string,
		parameters?: unknown[],
		runner?: QueryRunner,
	): void {
		super.logQuerySlow(time, query, privateQuery(query) ? redacted : parameters, runner);
	}
}
