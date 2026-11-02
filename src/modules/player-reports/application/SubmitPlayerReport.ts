import { playerReportDetails } from "../domain/PlayerReportText";
import type { PlayerReportRepository } from "../domain/PlayerReportRepository";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { REPORT_REASONS, type SubmitReportInput } from "../domain/PlayerReport";

export class SubmitPlayerReport {
	constructor(private readonly repository: PlayerReportRepository) {}
	async run(input: SubmitReportInput) {
		const details = playerReportDetails(input.details);
		if (
			!input.reporterId ||
			input.reporterId === input.reportedUserId ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.gameId) ||
			!input.reportedUserId ||
			input.reportedUserId.length > 128 ||
			!REPORT_REASONS.includes(input.reason)
		)
			throw new InvalidArgumentError("Invalid player report");
		const result = await this.repository.submit({
			...input,
			gameId: input.gameId.toLowerCase(),
			details,
		});
		if (result.outcome === "quota")
			throw new ConflictError("You can submit at most five new player reports in 24 hours");
		if (result.outcome === "ineligible")
			throw new NotFoundError("No recent reportable match with this opponent");
		if (result.outcome === "accepted") return result.receipt;
		throw new Error("Unexpected player report outcome");
	}
}
