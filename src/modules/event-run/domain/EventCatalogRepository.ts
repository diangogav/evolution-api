import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventDefinition } from "./EventDefinition";

export interface EventCatalogRepository {
	findById(eventId: string, manager?: QueryableManager): Promise<EventDefinition | null>;
}

// Kept apart from `EventCatalogRepository` because only admin reads need every event.
export interface EventCatalogListing {
	list(): Promise<EventDefinition[]>;
}
