import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { AdventCalendar } from "../domain/AdventCalendar";
import { AdventCatalogRepository } from "../domain/AdventCatalogRepository";

const FIND_QUERY = `SELECT id, name, description, format, starts_at, ends_at, recovery_price,
	doors, decks, die FROM advent_calendar_catalog WHERE id = $1`;

type Row = {
	id: string;
	name: AdventCalendar["name"];
	description: AdventCalendar["description"];
	format: string;
	starts_at: Date | string;
	ends_at: Date | string;
	recovery_price: number | string;
	doors: AdventCalendar["doors"];
	decks: AdventCalendar["decks"];
	die: AdventCalendar["die"];
};

export class AdventCatalogPostgresRepository implements AdventCatalogRepository {
	async findById(calendarId: string, manager?: QueryableManager): Promise<AdventCalendar | null> {
		const [row] = await runQuery<Row>(FIND_QUERY, [calendarId], manager);
		if (!row) return null;
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			format: row.format,
			startsAt: new Date(row.starts_at),
			endsAt: new Date(row.ends_at),
			recoveryPrice: Number(row.recovery_price),
			doors: row.doors,
			decks: row.decks,
			die: row.die,
		};
	}
}
