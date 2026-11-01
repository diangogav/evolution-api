import type { PlayerReportRepository } from "../domain/PlayerReportRepository";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { REPORT_STATUSES, type ReportStatus } from "../domain/PlayerReport";
export class ListPlayerReports {
	constructor(private readonly repository: PlayerReportRepository) {}
	run(input: { page: number; limit: number; status?: ReportStatus }) {
		if (
			!Number.isInteger(input.page) ||
			input.page < 1 ||
			input.page > 1000 ||
			!Number.isInteger(input.limit) ||
			input.limit < 1 ||
			input.limit > 50 ||
			(input.status !== undefined && !REPORT_STATUSES.includes(input.status))
		)
			throw new InvalidArgumentError("Invalid player report page");
		return this.repository.list(input);
	}
}
