import { reviewNote } from "../domain/PlayerReportText";
import type { PlayerReportRepository } from "../domain/PlayerReportRepository";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { REPORT_STATUSES, type ReviewReportInput } from "../domain/PlayerReport";
export class ReviewPlayerReport {
	constructor(private readonly repository: PlayerReportRepository) {}
	async run(input: ReviewReportInput) {
		const note = reviewNote(input.note);
		if (
			!input.adminUserId ||
			!REPORT_STATUSES.includes(input.status) ||
			!Number.isInteger(input.expectedRevision) ||
			input.expectedRevision < 1
		)
			throw new InvalidArgumentError("A valid review status, revision and note are required");
		const result = await this.repository.review({ ...input, note });
		if (result.outcome === "missing") throw new NotFoundError("Player report not found");
		if (result.outcome === "conflict")
			throw new ConflictError("This report was reviewed by another administrator; reload it first");
		if (result.outcome === "accepted") return result.report;
		throw new Error("Unexpected report review outcome");
	}
}
