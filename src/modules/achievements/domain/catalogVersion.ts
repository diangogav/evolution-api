import { createHash } from "node:crypto";

type VersionedRow = { id: number; code: string; updatedAt: Date | string };

/** Stable digest of the ordered `id:code:updated_at` tuples of a catalog. */
export function catalogVersion(rows: VersionedRow[]): string {
	const hash = createHash("sha256");

	for (const row of rows) {
		hash.update(`${row.id}:${row.code}:${new Date(row.updatedAt).toISOString()}\n`);
	}

	return hash.digest("hex");
}
