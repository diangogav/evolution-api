import { describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { MatchPostgresRepository } from "../../../../../src/modules/match/infrastructure/MatchPostgresRepository";

type QueryChain = Record<string, ReturnType<typeof mock>>;

type RankRow = { type: string; pattern: string | null };

const REQUEST = { userId: "user-1", limit: 10, page: 1, season: 5 };

function createChain(): QueryChain {
	const chain: QueryChain = {};
	for (const method of ["where", "andWhere", "orderBy", "offset", "limit"]) {
		chain[method] = mock(() => chain);
	}
	chain.getMany = mock(async () => []);

	return chain;
}

function stubDataSource(rankRows: RankRow[]) {
	const chain = createChain();
	const repositorySpy = spyOn(dataSource, "getRepository").mockReturnValue({
		createQueryBuilder: mock(() => chain),
	} as never);
	const querySpy = spyOn(dataSource, "query").mockImplementation((async () => rankRows) as never);

	return {
		chain,
		querySpy,
		restore: () => {
			repositorySpy.mockRestore();
			querySpy.mockRestore();
		},
	};
}

function banListCondition(
	chain: QueryChain,
): { condition: string; parameters: Record<string, string> } | null {
	const calls = chain.andWhere.mock.calls.filter(
		([condition]) => !String(condition).includes("match_resume.season"),
	);

	if (calls.length === 0) {
		return null;
	}

	const [condition, parameters] = calls[calls.length - 1] as [string, Record<string, string>];

	return { condition, parameters: parameters ?? {} };
}

function unescapeLike(value: string): string {
	return value.replace(/\\(.)/g, "$1");
}

function storedNamesMatching(chain: QueryChain, storedNames: string[]): string[] {
	const emitted = banListCondition(chain);

	if (!emitted) {
		return storedNames;
	}

	const terms = emitted.condition.replace(/^\(|\)$/g, "").split(" OR ");

	return storedNames.filter((storedName) =>
		terms.some((term) => {
			const like = term.match(/^match_resume\.banListName LIKE :(\w+)$/);

			if (like) {
				const value = emitted.parameters[like[1]];

				return value.startsWith("%") && storedName.endsWith(unescapeLike(value.slice(1)));
			}

			const equals = term.match(/^match_resume\.banListName = :(\w+)$/);

			return equals ? storedName === emitted.parameters[equals[1]] : false;
		}),
	);
}

describe("MatchPostgresRepository", () => {
	it("filters a ban list rank by exact name", async () => {
		const { chain, querySpy, restore } = stubDataSource([{ type: "banlist", pattern: null }]);

		await new MatchPostgresRepository().get({ ...REQUEST, banListName: "2026.05 TCG" });

		expect(banListCondition(chain)).toEqual({
			condition: "match_resume.banListName = :banListName",
			parameters: { banListName: "2026.05 TCG" },
		});
		expect(querySpy).toHaveBeenCalledTimes(1);

		restore();
	});

	it("expands a group rank into an OR of its member patterns", async () => {
		const { chain, restore } = stubDataSource([
			{ type: "group", pattern: "* Edison" },
			{ type: "group", pattern: "Goat Format" },
		]);

		await new MatchPostgresRepository().get({ ...REQUEST, banListName: "Edison" });

		const emitted = banListCondition(chain);

		expect(emitted?.condition).toBe(
			"(match_resume.banListName LIKE :banListPattern0 OR match_resume.banListName = :banListPattern1)",
		);
		expect(emitted?.parameters).toEqual({
			banListPattern0: "% Edison",
			banListPattern1: "Goat Format",
		});
		expect(
			storedNamesMatching(chain, ["March 2010 Edison", "Goat Format", "Edison", "2026.05 TCG"]),
		).toEqual(["March 2010 Edison", "Goat Format"]);

		restore();
	});

	it("matches the names stored on the matches, including ban lists without a rank row", async () => {
		const { chain, querySpy, restore } = stubDataSource([{ type: "group", pattern: "* TCG" }]);

		await new MatchPostgresRepository().get({ ...REQUEST, banListName: "TCG" });

		expect(querySpy.mock.calls[0]?.[1]).toEqual(["TCG"]);
		expect(String(querySpy.mock.calls[0]?.[0])).not.toContain("match");
		expect(storedNamesMatching(chain, ["2019.01 TCG", "2026.05 TCG", "TCG"])).toEqual([
			"2019.01 TCG",
			"2026.05 TCG",
		]);

		restore();
	});

	it("matches no stored ban list when a group rank has no member patterns", async () => {
		const { chain, restore } = stubDataSource([{ type: "group", pattern: null }]);

		await new MatchPostgresRepository().get({ ...REQUEST, banListName: "Empty Format" });

		expect(banListCondition(chain)).toEqual({ condition: "FALSE", parameters: {} });

		restore();
	});

	it("applies no ban list filter for a global rank", async () => {
		const { chain, restore } = stubDataSource([{ type: "global", pattern: null }]);

		await new MatchPostgresRepository().get({ ...REQUEST, banListName: "Global" });

		expect(banListCondition(chain)).toBeNull();

		restore();
	});

	it("falls back to an exact name match when the name has no rank", async () => {
		const { chain, restore } = stubDataSource([]);

		await new MatchPostgresRepository().get({ ...REQUEST, banListName: "Unknown Ladder" });

		expect(banListCondition(chain)).toEqual({
			condition: "match_resume.banListName = :banListName",
			parameters: { banListName: "Unknown Ladder" },
		});

		restore();
	});

	it("does not filter nor resolve any rank when no ban list name is given", async () => {
		const { chain, querySpy, restore } = stubDataSource([]);

		await new MatchPostgresRepository().get(REQUEST);

		expect(banListCondition(chain)).toBeNull();
		expect(querySpy).not.toHaveBeenCalled();

		restore();
	});
});
