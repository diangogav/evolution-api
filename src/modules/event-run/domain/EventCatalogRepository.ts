import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventDefinition } from "./EventDefinition";

export interface EventCatalogRepository {
	findById(eventId: string, manager?: QueryableManager): Promise<EventDefinition | null>;
}
