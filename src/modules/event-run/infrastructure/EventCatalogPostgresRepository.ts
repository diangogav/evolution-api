import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventCatalogRepository } from "../domain/EventCatalogRepository";
import { EventDefinition } from "../domain/EventDefinition";
import { runQuery } from "./runQuery";

const FIND_QUERY = `SELECT id, name, description, format, starts_at, ends_at, attempts_per_day,
	waves, decks, prize_tiers FROM event_catalog WHERE id = $1`;

type Row = {
	id: string;
	name: EventDefinition["name"];
	description: EventDefinition["description"];
	format: string;
	starts_at: Date;
	ends_at: Date;
	attempts_per_day: number;
	waves: EventDefinition["waves"];
	decks: EventDefinition["decks"];
	prize_tiers: EventDefinition["prizeTiers"];
};

export class EventCatalogPostgresRepository implements EventCatalogRepository {
	async findById(eventId: string, manager?: QueryableManager): Promise<EventDefinition | null> {
		const [row] = await runQuery<Row>(FIND_QUERY, [eventId], manager);
		if (!row) return null;
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			format: row.format,
			startsAt: new Date(row.starts_at),
			endsAt: new Date(row.ends_at),
			attemptsPerDay: Number(row.attempts_per_day),
			waves: row.waves,
			decks: row.decks,
			prizeTiers: row.prize_tiers,
		};
	}
}
