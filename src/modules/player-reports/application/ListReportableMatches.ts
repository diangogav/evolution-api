import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import type { PlayerReportRepository } from "../domain/PlayerReportRepository";
export class ListReportableMatches {
	constructor(private readonly repository: PlayerReportRepository) {}
	run(input: { reporterId: string; page: number; limit: number; now: Date }) {
		if (
			!input.reporterId ||
			!Number.isInteger(input.page) ||
			input.page < 1 ||
			input.page > 1000 ||
			!Number.isInteger(input.limit) ||
			input.limit < 1 ||
			input.limit > 50
		)
			throw new InvalidArgumentError("Invalid reportable match page");
		return this.repository.listMatches(input);
	}
}
