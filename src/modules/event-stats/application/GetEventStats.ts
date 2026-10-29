import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { EventCatalogRepository } from "../../event-run/domain/EventCatalogRepository";
import {
	buildEventStatsReport,
	type EventStatsReport,
	type EventStatsRepository,
} from "../domain/EventStatsReport";

export interface GetEventStatsInput {
	eventId: string;
	now: Date;
}

export type GetEventStatsResult = EventStatsReport;

export class GetEventStats {
	constructor(
		private readonly catalog: Pick<EventCatalogRepository, "findById">,
		private readonly repository: EventStatsRepository,
	) {}

	async run(input: GetEventStatsInput): Promise<GetEventStatsResult> {
		const event = await this.catalog.findById(input.eventId);
		if (!event) throw new NotFoundError(`Event ${input.eventId} not found`);
		return buildEventStatsReport(event, await this.repository.loadRawStats(event.id), input.now);
	}
}
