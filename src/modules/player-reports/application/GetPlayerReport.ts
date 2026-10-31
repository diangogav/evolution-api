import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { PlayerReportRepository } from "../domain/PlayerReport";
export class GetPlayerReport {
	constructor(private readonly repository: PlayerReportRepository) {}
	async run(id: string) {
		const report = await this.repository.get(id);
		if (!report) throw new NotFoundError("Player report not found");
		return report;
	}
}
