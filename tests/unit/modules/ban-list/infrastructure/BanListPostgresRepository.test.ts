import { describe, expect, it, mock, spyOn } from "bun:test";
import { config } from "src/config";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../../../src/evolution-types/src/entities/PlayerStatsEntity";
import { BanListPostgresRepository } from "../../../../../src/modules/ban-list/infrastructure/BanListPostgresRepository";

type QueryChain = Record<string, unknown>;

function createChain(rows: unknown[]): QueryChain {
	const chain: QueryChain = {};
	const chainable = [
		"select",
		"addSelect",
		"innerJoin",
		"where",
		"andWhere",
		"groupBy",
		"addGroupBy",
		"orderBy",
	];
	for (const method of chainable) {
		chain[method] = mock(() => chain);
	}
	chain.getRawMany = mock(async () => rows);

	return chain;
}

function stubRepositoryQuery(rows: { name: string }[]) {
	const chain = createChain(rows);

	const repositorySpy = spyOn(dataSource, "getRepository").mockReturnValue({
		createQueryBuilder: mock(() => chain),
	} as never);

	return { chain, repositorySpy };
}

function stubGroupedQueries(ranks: unknown[], patterns: unknown[]) {
	const ranksChain = createChain(ranks);
	const patternsChain = createChain(patterns);

	const repositorySpy = spyOn(dataSource, "getRepository").mockImplementation(
		(entity) =>
			({
				createQueryBuilder: mock(() => (entity === PlayerStatsEntity ? ranksChain : patternsChain)),
			}) as never,
	);

	return { ranksChain, patternsChain, repositorySpy };
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

describe("BanListPostgresRepository — grouped", () => {
	const playedRanks = [
		{ id: "rank-global", name: "Global", type: "global" },
		{ id: "rank-edison", name: "Edison", type: "group" },
		{ id: "rank-march", name: "March 2010 Edison", type: "banlist" },
		{ id: "rank-tcg", name: "TCG", type: "banlist" },
	];

	it("builds the sections from the ranks played in the season and their group patterns", async () => {
		const { repositorySpy } = stubGroupedQueries(playedRanks, [
			{ rankId: "rank-edison", pattern: "* Edison" },
		]);

		const result = await new BanListPostgresRepository().getGrouped(5);

		expect(result).toEqual([
			{ name: "Global", type: "global", banLists: [] },
			{ name: "Edison", type: "group", banLists: ["March 2010 Edison"] },
			{ name: "TCG", type: "banlist", banLists: [] },
		]);

		repositorySpy.mockRestore();
	});

	it("only reads ranks with player_stats rows for the season and hides disabled ones", async () => {
		const { ranksChain, repositorySpy } = stubGroupedQueries([], []);

		await new BanListPostgresRepository().getGrouped(7);

		expect(ranksChain.innerJoin).toHaveBeenCalledWith(
			"ranks",
			"ranks",
			"ranks.id = player_stats.rank_id",
		);
		expect(ranksChain.where).toHaveBeenCalledWith("player_stats.season = :season", { season: 7 });
		expect(ranksChain.andWhere).toHaveBeenCalledWith("ranks.enabled = true");

		repositorySpy.mockRestore();
	});

	it("reads the patterns of enabled group ranks only", async () => {
		const { patternsChain, repositorySpy } = stubGroupedQueries([], []);

		await new BanListPostgresRepository().getGrouped(7);

		expect(patternsChain.where).toHaveBeenCalledWith("ranks.enabled = true");
		expect(patternsChain.andWhere).toHaveBeenCalledWith("ranks.type = :type", { type: "group" });

		repositorySpy.mockRestore();
	});

	it("falls back to the configured season when none is given", async () => {
		const { ranksChain, repositorySpy } = stubGroupedQueries([], []);

		await new BanListPostgresRepository().getGrouped();

		expect(ranksChain.where).toHaveBeenCalledWith("player_stats.season = :season", {
			season: config.season,
		});

		repositorySpy.mockRestore();
	});
});
