import { MatchFacts } from "./evaluateMatch";

// Position in a source's (created_at, id) order. Null means "from the beginning".
// `lastCreatedAt` is the UTC wall clock as text with microseconds
// ("2026-10-23 10:00:05.123456"): Postgres timestamps keep microseconds and a JS Date
// keeps milliseconds, so going through a Date would truncate the cursor and re-read the
// last processed row on every tick.
export type SourceCursor = {
	lastCreatedAt: string | null;
	lastId: string | null;
};

export type SourcedMatchFacts = MatchFacts & {
	sourceId: string;
	createdAt: string;
};

// A table the worker drains in insertion order. Each source keeps its own cursor so a
// second table (unranked matches) can be added without touching the first.
export interface MatchSource {
	readonly name: string;
	fetchAfter(cursor: SourceCursor, limit: number, notAfter: Date): Promise<SourcedMatchFacts[]>;
}
