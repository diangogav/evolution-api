// TypeORM answers UPDATE ... RETURNING with [rows, affectedCount] on Postgres.
export function returnedRows<T>(result: unknown): T[] {
	if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
	if (Array.isArray(result)) return result as T[];
	return [];
}

export const toDate = (value: Date | string | null): Date | null =>
	value === null ? null : new Date(value);
