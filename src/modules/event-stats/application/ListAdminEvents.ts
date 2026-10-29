import type { EventCatalogListing } from "../../event-run/domain/EventCatalogRepository";
import { type EventSummary, summarizeEvents } from "../domain/EventStatsReport";

export type ListAdminEventsResult = EventSummary[];

export class ListAdminEvents {
	constructor(private readonly catalog: EventCatalogListing) {}

	async run(): Promise<ListAdminEventsResult> {
		return summarizeEvents(await this.catalog.list());
	}
}
