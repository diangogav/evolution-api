import { AdvancedConsoleLogger, type Logger, type LoggerOptions, type QueryRunner } from "typeorm";

const redacted = ["[sensitive query parameters redacted]"];

// SQL is parameterized by callers. Keep driver errors intact for diagnostics;
// only the parameter list for configured sensitive tables is redacted.
export class RedactingQueryLogger extends AdvancedConsoleLogger {
	private readonly sensitiveTables: Set<string>;

	constructor(options: LoggerOptions, sensitiveTables: readonly string[]) {
		super(options);
		this.sensitiveTables = new Set(sensitiveTables.map((table) => table.toLowerCase()));
	}

	private queryParameters(query: string, parameters?: unknown[]): unknown[] | undefined {
		const identifiers = query.match(/[a-z_][a-z0-9_$]*/gi) ?? [];
		return identifiers.some((name) => this.sensitiveTables.has(name.toLowerCase()))
			? redacted
			: parameters;
	}

	override logQuery(query: string, parameters?: unknown[], runner?: QueryRunner): void {
		super.logQuery(query, this.queryParameters(query, parameters), runner);
	}

	override logQueryError(
		error: string | Error,
		query: string,
		parameters?: unknown[],
		runner?: QueryRunner,
	): void {
		// The Logger interface and runtime accept Error; AbstractLogger's declaration
		// narrows it to string in TypeORM 0.3.31. Cast the method, never the error value.
		(super.logQueryError as Logger["logQueryError"]).call(
			this,
			error,
			query,
			this.queryParameters(query, parameters),
			runner,
		);
	}

	override logQuerySlow(
		time: number,
		query: string,
		parameters?: unknown[],
		runner?: QueryRunner,
	): void {
		super.logQuerySlow(time, query, this.queryParameters(query, parameters), runner);
	}
}
