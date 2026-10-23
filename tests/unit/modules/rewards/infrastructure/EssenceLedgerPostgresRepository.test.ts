import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import { EssenceLedgerPostgresRepository } from "../../../../../src/modules/rewards/infrastructure/EssenceLedgerPostgresRepository";

function entry(overrides: Partial<EssenceLedgerEntry> = {}): EssenceLedgerEntry {
	return {
		userId: "user-1",
		kind: "mission",
		referenceKey: "win_1:2026-10-23",
		delta: 20,
		...overrides,
	};
}

describe("EssenceLedgerPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;
	let repository: EssenceLedgerPostgresRepository;

	beforeEach(() => {
		querySpy = spyOn(cosmeticsDataSource, "query").mockResolvedValue([]);
		repository = new EssenceLedgerPostgresRepository();
	});

	afterEach(() => {
		mock.restore();
	});

	it("append reports inserted when the row lands and skipped when the unique key already exists", async () => {
		querySpy.mockResolvedValueOnce([{ id: "row-1" }]);
		expect(await repository.append(entry())).toBe("inserted");

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("INSERT INTO essence_ledger");
		expect(sql).toContain("ON CONFLICT DO NOTHING");
		expect(sql).toContain("RETURNING id");
		expect(params).toEqual(["user-1", "mission", "win_1:2026-10-23", 20]);

		querySpy.mockResolvedValueOnce([]);
		expect(await repository.append(entry())).toBe("skipped");
	});

	it("append runs through the given manager when a caller composes it inside a transaction", async () => {
		const manager = { query: mock(async () => [{ id: "row-1" }]) };

		expect(await repository.append(entry(), manager)).toBe("inserted");

		expect(manager.query).toHaveBeenCalledTimes(1);
		expect(querySpy).not.toHaveBeenCalled();
	});

	it("balanceOf sums the deltas of the user and reads zero when there are no rows", async () => {
		querySpy.mockResolvedValueOnce([{ balance: 170 }]);
		expect(await repository.balanceOf("user-1")).toBe(170);

		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("SUM(delta)");
		expect(sql).toContain("FROM essence_ledger");
		expect(params).toEqual(["user-1"]);

		querySpy.mockResolvedValueOnce([{ balance: null }]);
		expect(await repository.balanceOf("user-2")).toBe(0);
	});
});
