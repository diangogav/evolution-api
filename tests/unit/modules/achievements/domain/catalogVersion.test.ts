import { describe, expect, it } from "bun:test";

import { catalogVersion } from "../../../../../src/modules/achievements/domain/catalogVersion";

const row = (id: number, code: string, updatedAt: string) => ({ id, code, updatedAt });

describe("catalogVersion", () => {
	it("is a stable sha256 hex digest of the ordered id, code and updated_at tuples", () => {
		const rows = [row(1001, "first_win", "2026-10-09T00:00:00.000Z")];

		expect(catalogVersion(rows)).toMatch(/^[0-9a-f]{64}$/);
		expect(catalogVersion(rows)).toBe(catalogVersion([...rows]));
	});

	it("changes when a row is renamed, retimed or reordered", () => {
		const a = row(1, "first_win", "2026-10-09T00:00:00.000Z");
		const b = row(2, "wins_10", "2026-10-09T00:00:00.000Z");
		const base = catalogVersion([a, b]);

		expect(catalogVersion([a, row(2, "wins_50", b.updatedAt)])).not.toBe(base);
		expect(catalogVersion([a, row(2, "wins_10", "2026-10-10T00:00:00.000Z")])).not.toBe(base);
		expect(catalogVersion([b, a])).not.toBe(base);
	});
});
