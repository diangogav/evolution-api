import { describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { BanListPostgresRepository } from "../../../../../src/modules/ban-list/infrastructure/BanListPostgresRepository";

function stubRepositoryQuery(rows: { name: string }[]) {
	const chain: Record<string, unknown> = {};
	const chainable = ["select", "innerJoin", "where", "andWhere", "groupBy", "orderBy"];
	for (const method of chainable) {
		chain[method] = mock(() => chain);
	}
	chain.getRawMany = mock(async () => rows);

	const repositorySpy = spyOn(dataSource, "getRepository").mockReturnValue({
		createQueryBuilder: mock(() => chain),
	} as never);

	return { chain, repositorySpy };
}

describe("BanListPostgresRepository", () => {
	it("returns the rank names that have player_stats rows for the season", async () => {
		const { repositorySpy } = stubRepositoryQuery([{ name: "Edison" }, { name: "Global" }]);

		const result = await new BanListPostgresRepository().get(5);

		expect(result).toEqual(["Edison", "Global"]);

		repositorySpy.mockRestore();
	});

	it("resolves names through the ranks join and hides disabled ranks", async () => {
		const { chain, repositorySpy } = stubRepositoryQuery([]);

		await new BanListPostgresRepository().get(5);

		expect(chain.innerJoin).toHaveBeenCalledWith(
			"ranks",
			"ranks",
			"ranks.id = player_stats.rank_id",
		);
		expect(chain.andWhere).toHaveBeenCalledWith("ranks.enabled = true");

		repositorySpy.mockRestore();
	});
});
