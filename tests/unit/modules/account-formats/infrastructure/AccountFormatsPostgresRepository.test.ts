import { describe, expect, it, mock } from "bun:test";

import { AccountFormatsPostgresRepository } from "../../../../../src/modules/account-formats/infrastructure/AccountFormatsPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ").trim();

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

describe("AccountFormatsPostgresRepository", () => {
	it("reads the user's formats, keeping null apart from an empty choice", async () => {
		const manager = managerReturning([{ formats: null }], [{ formats: [] }], []);
		const repository = new AccountFormatsPostgresRepository(manager);

		expect(await repository.find("u-1")).toBeNull();
		expect(await repository.find("u-1")).toEqual([]);
		expect(await repository.find("ghost")).toBeUndefined();

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe("SELECT formats FROM users WHERE id = $1 AND deleted_at IS NULL");
		expect(params).toEqual(["u-1"]);
	});

	it("skips stored ids that left the catalogue and keeps catalogue order", async () => {
		const manager = managerReturning([{ formats: ["goat", "retired", "tcg"] }]);

		expect(await new AccountFormatsPostgresRepository(manager).find("u-1")).toEqual([
			"tcg",
			"goat",
		]);
	});

	it("replaces the user's formats and reports whether the user exists", async () => {
		const manager = managerReturning([[{ id: "u-1" }], 1], [[], 0]);
		const repository = new AccountFormatsPostgresRepository(manager);

		expect(await repository.save("u-1", ["tcg", "rush"])).toBe(true);
		expect(await repository.save("ghost", [])).toBe(false);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe(
			"UPDATE users SET formats = $2::text[] WHERE id = $1 AND deleted_at IS NULL RETURNING id",
		);
		expect(params).toEqual(["u-1", ["tcg", "rush"]]);
		expect(manager.query.mock.calls[1][1]).toEqual(["ghost", []]);
	});
});
