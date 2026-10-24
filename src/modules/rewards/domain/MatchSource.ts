import { MatchFacts } from "./evaluateMatch";

// Position in a source's (created_at, id) order. Null means "from the beginning".
export type SourceCursor = {
	lastCreatedAt: Date | null;
	lastId: string | null;
};

export type SourcedMatchFacts = MatchFacts & {
	sourceId: string;
	createdAt: Date;
};

// A table the worker drains in insertion order. Each source keeps its own cursor so a
// second table (unranked matches) can be added without touching the first.
export interface MatchSource {
	readonly name: string;
	fetchAfter(cursor: SourceCursor, limit: number, notAfter: Date): Promise<SourcedMatchFacts[]>;
}
