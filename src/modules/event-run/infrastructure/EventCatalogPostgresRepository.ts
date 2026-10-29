import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EventCatalogListing, EventCatalogRepository } from "../domain/EventCatalogRepository";
import { EventDefinition } from "../domain/EventDefinition";
import { runQuery } from "./runQuery";

const COLUMNS = `id, name, description, format, starts_at, ends_at, attempts_per_day,
	waves, decks, prize_tiers`;

const FIND_QUERY = `SELECT ${COLUMNS} FROM event_catalog WHERE id = $1`;

const LIST_QUERY = `SELECT ${COLUMNS} FROM event_catalog ORDER BY starts_at DESC`;

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

export class EventCatalogPostgresRepository implements EventCatalogRepository, EventCatalogListing {
	async findById(eventId: string, manager?: QueryableManager): Promise<EventDefinition | null> {
		const [row] = await runQuery<Row>(FIND_QUERY, [eventId], manager);
		return row ? toDefinition(row) : null;
	}

	async list(): Promise<EventDefinition[]> {
		return (await runQuery<Row>(LIST_QUERY, [])).map(toDefinition);
	}
}

function toDefinition(row: Row): EventDefinition {
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
