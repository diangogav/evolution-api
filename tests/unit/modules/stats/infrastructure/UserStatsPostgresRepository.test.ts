import { describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { RatingSummary } from "../../../../../src/modules/stats/domain/UserStats";
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
			{ banListName: "Global", rating: 1050, gamesPlayed: 12, peak: 1080, rankType: "global" },
			{ banListName: "Edison", rating: 980, gamesPlayed: 3, peak: 1020, rankType: "banlist" },
		]);

		const result = await new UserStatsPostgresRepository().find("user-1", "Global", 5);

		expect(querySpy).toHaveBeenCalledTimes(1);
		const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain("player_ratings");
		expect(sql).toContain("INNER JOIN ranks ON ranks.id = player_ratings.rank_id");
		expect(params).toEqual(["user-1", 5]);

		expect(result?.toJson().ratings).toEqual([
			{
				banListName: "Global",
				rating: 1050,
				gamesPlayed: 12,
				peak: 1080,
				provisional: false,
				rankType: "global",
			},
			{
				banListName: "Edison",
				rating: 980,
				gamesPlayed: 3,
				peak: 1020,
				provisional: true,
				rankType: "banlist",
			},
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

describe("UserStatsPostgresRepository — rating members", () => {
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

	function ratingRow(rankId: string, banListName: string, rankType: string) {
		return { rankId, banListName, rating: 1000, gamesPlayed: 20, peak: 1010, rankType };
	}

	function stubRatingQueries(ratingRows: unknown[], patternRows: unknown[] = []) {
		return spyOn(dataSource, "query").mockImplementation((async (sql: string) =>
			sql.includes("rank_members") ? patternRows : ratingRows) as never);
	}

	async function ratingsOf(ratingRows: unknown[], patternRows: unknown[] = []) {
		const queryBuilderSpy = stubMainQuery(rawStatsRow);
		const querySpy = stubRatingQueries(ratingRows, patternRows);

		const result = await new UserStatsPostgresRepository().find("user-1", "Global", 5);
		const calls = [...querySpy.mock.calls] as [string, unknown[]][];

		queryBuilderSpy.mockRestore();
		querySpy.mockRestore();

		return { ratings: result?.toJson().ratings ?? [], calls };
	}

	function membersOf(ratings: RatingSummary[], banListName: string) {
		return ratings.find((rating) => rating.banListName === banListName)?.members;
	}

	it("nests the ban list ladders matched by a group's patterns under that group", async () => {
		const { ratings } = await ratingsOf(
			[
				ratingRow("rank-edison", "2010.03 Edison", "banlist"),
				ratingRow("rank-edison-group", "Edison", "group"),
				ratingRow("rank-goat", "Goat", "banlist"),
			],
			[{ rankId: "rank-edison-group", pattern: "* Edison" }],
		);

		expect(membersOf(ratings, "Edison")).toEqual(["2010.03 Edison"]);
	});

	it("reads every group's patterns with a single query", async () => {
		const { calls } = await ratingsOf(
			[
				ratingRow("rank-edison-group", "Edison", "group"),
				ratingRow("rank-retro-group", "Retro", "group"),
				ratingRow("rank-march", "March 2010 Edison", "banlist"),
			],
			[
				{ rankId: "rank-edison-group", pattern: "* Edison" },
				{ rankId: "rank-retro-group", pattern: "March 2010 Edison" },
			],
		);

		expect(calls).toHaveLength(2);
		const [sql, params] = calls[1];
		expect(sql).toContain("rank_members");
		expect(params).toEqual([["rank-edison-group", "rank-retro-group"]]);
	});

	it("lists a ban list matched by two groups inside both groups", async () => {
		const { ratings } = await ratingsOf(
			[
				ratingRow("rank-edison-group", "Edison", "group"),
				ratingRow("rank-march", "March 2010 Edison", "banlist"),
				ratingRow("rank-retro-group", "Retro", "group"),
			],
			[
				{ rankId: "rank-edison-group", pattern: "* Edison" },
				{ rankId: "rank-retro-group", pattern: "March 2010 Edison" },
			],
		);

		expect(membersOf(ratings, "Edison")).toEqual(["March 2010 Edison"]);
		expect(membersOf(ratings, "Retro")).toEqual(["March 2010 Edison"]);
	});

	it("keeps a ban list that matches no pattern out of every group's members", async () => {
		const { ratings } = await ratingsOf(
			[
				ratingRow("rank-edison-group", "Edison", "group"),
				ratingRow("rank-goat", "Goat", "banlist"),
				ratingRow("rank-tcg-group", "TCG", "group"),
			],
			[
				{ rankId: "rank-edison-group", pattern: "* Edison" },
				{ rankId: "rank-tcg-group", pattern: "* TCG" },
			],
		);

		expect(membersOf(ratings, "Edison")).toEqual([]);
		expect(membersOf(ratings, "TCG")).toEqual([]);
	});

	it("orders the members of a group like the ratings list itself", async () => {
		const { ratings } = await ratingsOf(
			[
				ratingRow("rank-march", "2010.03 Edison", "banlist"),
				ratingRow("rank-september", "2010.09 Edison", "banlist"),
				ratingRow("rank-edison-group", "Edison", "group"),
			],
			[{ rankId: "rank-edison-group", pattern: "* Edison" }],
		);

		expect(membersOf(ratings, "Edison")).toEqual(["2010.03 Edison", "2010.09 Edison"]);
	});

	it("does not add a members key to ban list and global entries", async () => {
		const { ratings } = await ratingsOf(
			[
				ratingRow("rank-march", "2010.03 Edison", "banlist"),
				ratingRow("rank-edison-group", "Edison", "group"),
				ratingRow("rank-global", "Global", "global"),
			],
			[{ rankId: "rank-edison-group", pattern: "* Edison" }],
		);

		expect(ratings.find((rating) => rating.banListName === "2010.03 Edison")).not.toHaveProperty(
			"members",
		);
		expect(ratings.find((rating) => rating.banListName === "Global")).not.toHaveProperty("members");
	});

	it("does not read the group patterns when the user has no group rating", async () => {
		const { calls } = await ratingsOf([ratingRow("rank-global", "Global", "global")]);

		expect(calls).toHaveLength(1);
	});
});

type MockedCalls = { mock: { calls: unknown[][] } };

function stubLeaderboardQuery(rows: Record<string, unknown>[]) {
	const chain: Record<string, unknown> = {};
	const chainable = [
		"select",
		"from",
		"innerJoin",
		"leftJoin",
		"where",
		"andWhere",
		"groupBy",
		"orderBy",
		"addOrderBy",
		"offset",
		"limit",
		"setParameters",
	];
	for (const method of chainable) {
		chain[method] = mock(() => chain);
	}
	chain.getRawMany = mock(async () => rows);

	const queryBuilderSpy = spyOn(dataSource, "createQueryBuilder").mockImplementation(
		() => chain as never,
	);

	return { chain, queryBuilderSpy };
}

function positionExpression(chain: Record<string, unknown>): string {
	const columns = (chain.select as MockedCalls).mock.calls[0][0] as string[];
	const expression = columns.find((column) => column.includes("ROW_NUMBER"));

	return expression ?? "";
}

describe("UserStatsPostgresRepository — leaderboard", () => {
	const params = { page: 1, limit: 10, banListName: "Global", season: 5 };

	it("orders by rating DESC NULLS LAST before points when sorting by rating", async () => {
		const { chain, queryBuilderSpy } = stubLeaderboardQuery([]);

		await new UserStatsPostgresRepository().leaderboard({ ...params, sortBy: "rating" });

		expect(positionExpression(chain)).toContain(
			"ORDER BY MAX(player_ratings.rating) DESC NULLS LAST, player_stats.points DESC",
		);
		expect(chain.orderBy).toHaveBeenCalledWith("MAX(player_ratings.rating)", "DESC", "NULLS LAST");
		expect(chain.addOrderBy).toHaveBeenCalledWith("player_stats.points", "DESC");
		expect(chain.addOrderBy).toHaveBeenCalledWith("winRate", "DESC");

		queryBuilderSpy.mockRestore();
	});

	it("keeps the points ordering when sorting by points", async () => {
		const { chain, queryBuilderSpy } = stubLeaderboardQuery([]);

		await new UserStatsPostgresRepository().leaderboard({ ...params, sortBy: "points" });

		expect(positionExpression(chain)).toBe(
			"ROW_NUMBER() OVER (ORDER BY player_stats.points DESC, ((player_stats.wins::FLOAT / NULLIF(player_stats.losses + player_stats.wins, 0)) * 100) DESC) AS position",
		);
		expect(chain.orderBy).toHaveBeenCalledWith("player_stats.points", "DESC");
		expect(chain.addOrderBy).toHaveBeenCalledWith("winRate", "DESC");
		expect((chain.orderBy as MockedCalls).mock.calls).toHaveLength(1);
		expect((chain.addOrderBy as MockedCalls).mock.calls).toHaveLength(1);

		queryBuilderSpy.mockRestore();
	});

	it("defaults to the points ordering when no sortBy is given", async () => {
		const { chain, queryBuilderSpy } = stubLeaderboardQuery([]);

		await new UserStatsPostgresRepository().leaderboard(params);

		expect(positionExpression(chain)).not.toContain("player_ratings");
		expect(chain.orderBy).toHaveBeenCalledWith("player_stats.points", "DESC");
		expect((chain.addOrderBy as MockedCalls).mock.calls).toEqual([["winRate", "DESC"]]);

		queryBuilderSpy.mockRestore();
	});

	it("exposes rating, peak and provisional as null for players without a rating row", async () => {
		const { queryBuilderSpy } = stubLeaderboardQuery([
			{
				userid: "user-1",
				username: "rated",
				points: 120,
				wins: 10,
				losses: 4,
				banlistname: "Global",
				winrate: "71.4",
				position: 1,
				rating: 1050,
				peak: 1080,
				gamesPlayed: 4,
				achievements: [],
			},
			{
				userid: "user-2",
				username: "unrated",
				points: 90,
				wins: 6,
				losses: 6,
				banlistname: "Global",
				winrate: "50",
				position: 2,
				rating: null,
				peak: null,
				gamesPlayed: null,
				achievements: [],
			},
		]);

		const result = await new UserStatsPostgresRepository().leaderboard(params);

		expect(result.map((stats) => stats.toJson().rating)).toEqual([1050, null]);
		expect(result.map((stats) => stats.toJson().peak)).toEqual([1080, null]);
		expect(result.map((stats) => stats.toJson().provisional)).toEqual([true, null]);

		queryBuilderSpy.mockRestore();
	});
});
