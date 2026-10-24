// The slice of a transaction manager repositories need to join a transaction someone
// else opened. TypeORM's EntityManager satisfies it; ports stay free of TypeORM types.
export type QueryableManager = {
	query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
};
