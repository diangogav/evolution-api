import { describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { UserStatsPostgresRepository } from "../../../../../src/modules/stats/infrastructure/UserStatsPostgresRepository";

function stubMainQuery(rawOne: Record<string, unknown> | null) {
	const chain: Record<string, unknown> = {};
	const chainable = [
		"select",
		"from",
		"innerJoin",
		"leftJoin",
		"where",
		"andWhere",
		"groupBy",
		"setParameters",
	];
	for (const method of chainable) {
		chain[method] = mock(() => chain);
	}
	chain.getQuery = mock(() => "SELECT 1");
	chain.getParameters = mock(() => ({}));
	chain.getRawOne = mock(async () => rawOne);

	return spyOn(dataSource, "createQueryBuilder").mockImplementation(() => chain as never);
}

describe("UserStatsPostgresRepository — ratings", () => {
	const rawStatsRow = {
		username: "duelist",
		user_id: "user-1",
		points: 120,
		wins: 10,
		losses: 4,
		banlistname: "Global",
		win_rate: "71.4",
		position: 3,
		achievements: [],
	};

	it("joins player_ratings for the current season and derives provisional from games_played", async () => {
		const queryBuilderSpy = stubMainQuery(rawStatsRow);
		const querySpy = spyOn(dataSource, "query").mockResolvedValue([
			{ banListName: "Global", rating: 1050, gamesPlayed: 12, peak: 1080 },
			{ banListName: "Edison", rating: 980, gamesPlayed: 3, peak: 1020 },
		]);

		const result = await new UserStatsPostgresRepository().find("user-1", "Global", 5);

		expect(querySpy).toHaveBeenCalledTimes(1);
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("player_ratings");
		expect(sql).toContain("INNER JOIN ranks ON ranks.id = player_ratings.rank_id");
		expect(params).toEqual(["user-1", 5]);

		expect(result?.toJson().ratings).toEqual([
			{ banListName: "Global", rating: 1050, gamesPlayed: 12, peak: 1080, provisional: false },
			{ banListName: "Edison", rating: 980, gamesPlayed: 3, peak: 1020, provisional: true },
		]);

		queryBuilderSpy.mockRestore();
		querySpy.mockRestore();
	});

	it("returns an empty ratings array when the user has no player_ratings rows this season", async () => {
		const queryBuilderSpy = stubMainQuery(rawStatsRow);
		const querySpy = spyOn(dataSource, "query").mockResolvedValue([]);

		const result = await new UserStatsPostgresRepository().find("user-1", "Global", 5);

		expect(result?.toJson().ratings).toEqual([]);

		queryBuilderSpy.mockRestore();
		querySpy.mockRestore();
	});

	it("does not query player_ratings when the base stats row does not exist", async () => {
		const queryBuilderSpy = stubMainQuery(null);
		const querySpy = spyOn(dataSource, "query").mockResolvedValue([]);

		const result = await new UserStatsPostgresRepository().find("user-1", "Global", 5);

		expect(result).toBeNull();
		expect(querySpy).not.toHaveBeenCalled();

		queryBuilderSpy.mockRestore();
		querySpy.mockRestore();
	});
});
