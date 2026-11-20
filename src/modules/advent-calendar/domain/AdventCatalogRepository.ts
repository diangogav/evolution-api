import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { AdventCalendar } from "./AdventCalendar";

export interface AdventCatalogRepository {
	findById(calendarId: string, manager?: QueryableManager): Promise<AdventCalendar | null>;
}
