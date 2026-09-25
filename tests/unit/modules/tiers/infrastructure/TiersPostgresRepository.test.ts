import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { TiersPostgresRepository } from "../../../../../src/modules/tiers/infrastructure/TiersPostgresRepository";
import { tierGame } from "../fixtures/season7Slices";

describe("TiersPostgresRepository", () => {
	let querySpy: ReturnType<typeof spyOn>;
	let repository: TiersPostgresRepository;

	beforeEach(() => {
		querySpy = spyOn(dataSource, "query").mockResolvedValue([]);
		repository = new TiersPostgresRepository();
	});

	afterEach(() => {
		mock.restore();
	});

	describe("findEligibleRanks", () => {
		it("resolves the given names to banlist and group ranks only, passing the names as one array parameter", async () => {
			const ranks = [
				{ id: "rank-tcg", name: "TCG" },
				{ id: "rank-edison", name: "Edison" },
			];
			querySpy.mockResolvedValueOnce(ranks);

			expect(await repository.findEligibleRanks(["TCG", "Global", "Edison"])).toEqual(ranks);

			expect(querySpy).toHaveBeenCalledTimes(1);
			const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain("FROM ranks");
			expect(sql).toContain("name = ANY($1)");
			expect(sql).toContain("type IN ('banlist', 'group')");
			expect(params).toEqual([["TCG", "Global", "Edison"]]);
		});

		it("returns nothing for no names without touching the database", async () => {
			expect(await repository.findEligibleRanks([])).toEqual([]);

			expect(querySpy).not.toHaveBeenCalled();
		});
	});

	describe("findTierGames", () => {
		const query = { userIds: ["u1"], rankIds: ["rank-tcg", "rank-edison"], season: 7 };

		it("passes user ids, rank ids and season as the three positional parameters", async () => {
			const rows = [tierGame({ gameId: "g1" }), tierGame({ gameId: "g2", won: false })];
			querySpy.mockResolvedValueOnce(rows);

			expect(await repository.findTierGames(query)).toEqual(rows);

			expect(querySpy).toHaveBeenCalledTimes(1);
			const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
			expect(params).toEqual([["u1"], ["rank-tcg", "rank-edison"], 7]);
		});

		it("nets every ledger kind per game and keeps a game only while its kind balance is positive", async () => {
			await repository.findTierGames(query);

			const [sql] = querySpy.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain("WITH games AS");
			expect(sql).toContain("pl.user_id = ANY($1) AND pl.rank_id = ANY($2) AND pl.season = $3");
			expect(sql).toContain("GROUP BY pl.user_id, pl.rank_id, pl.game_id");
			expect(sql).toContain("SUM(pl.points_delta)::int");
			expect(sql).toContain("SUM(pl.wins_delta)::int");
			expect(sql.replace(/\s+/g, " ")).toContain(
				"HAVING COUNT(*) FILTER (WHERE pl.kind = 'applied') - COUNT(*) FILTER (WHERE pl.kind = 'reversal') + COUNT(*) FILTER (WHERE pl.kind = 'reinstatement') > 0",
			);
		});

		it("projects the replay row: epoch-ms timestamps, the duel time of every game and the applied opponent of the same rank", async () => {
			await repository.findTierGames(query);

			const [sql] = querySpy.mock.calls[0] as [string, unknown[]];
			for (const column of [
				'"userId"',
				'"rankId"',
				'"gameId"',
				'"pointsDelta"',
				'"won"',
				'"appliedId"',
				'"appliedAt"',
				'"duelAt"',
				'"opponentId"',
			]) {
				expect(sql).toContain(column);
			}
			expect(sql).toContain('g.wins_delta > 0 AS "won"');
			expect(sql).toContain('(EXTRACT(EPOCH FROM g.applied_at) * 1000)::float8 AS "appliedAt"');
			expect(sql).toContain(
				'(SELECT (EXTRACT(EPOCH FROM MIN(d.date)) * 1000)::float8 FROM duels d WHERE d.game_id = g.game_id) AS "duelAt"',
			);
			expect(sql).not.toContain("CASE WHEN");
			expect(sql).not.toContain("$4");
			expect(sql).toContain("SELECT MIN(o.user_id) FROM points_ledger o");
			expect(sql).toContain("o.game_id = g.game_id AND o.rank_id = g.rank_id");
			expect(sql).toContain("o.kind = 'applied' AND o.user_id <> g.user_id");
			expect(sql).not.toContain("ORDER BY");
		});

		it("returns nothing when either the user set or the rank set is empty, without touching the database", async () => {
			expect(await repository.findTierGames({ ...query, userIds: [] })).toEqual([]);
			expect(await repository.findTierGames({ ...query, rankIds: [] })).toEqual([]);

			expect(querySpy).not.toHaveBeenCalled();
		});
	});

	describe("findMasterCandidates", () => {
		const query = { rankId: "rank-tcg", season: 7, minGames: 20, limit: 50, offset: 100 };

		it("returns the candidate user ids in the order the database gave them", async () => {
			querySpy.mockResolvedValueOnce([{ userId: "u2" }, { userId: "u1" }, { userId: "u3" }]);

			expect(await repository.findMasterCandidates(query)).toEqual(["u2", "u1", "u3"]);
		});

		it("pages player_stats rows with enough games in the leaderboard total order, binding rank, season, minimum, limit and offset positionally", async () => {
			await repository.findMasterCandidates(query);

			expect(querySpy).toHaveBeenCalledTimes(1);
			const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain("FROM player_stats ps");
			expect(sql).toContain("ps.rank_id = $1 AND ps.season = $2 AND ps.wins + ps.losses >= $3");
			expect(sql).toContain("ps.wins::float / NULLIF(ps.wins + ps.losses, 0) AS win_rate");
			expect(sql).toContain("ORDER BY ps.points DESC, win_rate DESC, ps.user_id ASC");
			expect(sql).toContain("LIMIT $4 OFFSET $5");
			expect(params).toEqual(["rank-tcg", 7, 20, 50, 100]);
		});
	});

	describe("findMasterRatings", () => {
		const query = { rankId: "rank-tcg", season: 7, userIds: ["u1", "u2"] };

		it("reads rating and peak of the given users in the rank and season, binding the ids as one array parameter", async () => {
			const rows = [
				{ userId: "u1", rating: 1180, peak: 1210 },
				{ userId: "u2", rating: 1150, peak: 1150 },
			];
			querySpy.mockResolvedValueOnce(rows);

			expect(await repository.findMasterRatings(query)).toEqual(rows);

			expect(querySpy).toHaveBeenCalledTimes(1);
			const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain("FROM player_ratings pr");
			expect(sql).toContain('pr.user_id AS "userId", pr.rating, pr.peak');
			expect(sql).toContain("pr.rank_id = $1 AND pr.season = $2 AND pr.user_id = ANY($3)");
			expect(params).toEqual(["rank-tcg", 7, ["u1", "u2"]]);
		});

		it("returns nothing for no users without touching the database", async () => {
			expect(await repository.findMasterRatings({ ...query, userIds: [] })).toEqual([]);

			expect(querySpy).not.toHaveBeenCalled();
		});
	});

	describe("parameter binding", () => {
		const sentinels = {
			rankName: "TCG' OR 1=1 --",
			userId: "u-9c1f1c9e",
			rankId: "rank-7e0b2d4a",
			season: 7331,
			minGames: 2027,
			limit: 5039,
			offset: 6067,
		};

		it("never interpolates a caller value into any query text: every value travels as a positional parameter", async () => {
			await repository.findEligibleRanks([sentinels.rankName]);
			await repository.findTierGames({
				userIds: [sentinels.userId],
				rankIds: [sentinels.rankId],
				season: sentinels.season,
			});
			await repository.findMasterCandidates({
				rankId: sentinels.rankId,
				season: sentinels.season,
				minGames: sentinels.minGames,
				limit: sentinels.limit,
				offset: sentinels.offset,
			});
			await repository.findMasterRatings({
				rankId: sentinels.rankId,
				season: sentinels.season,
				userIds: [sentinels.userId],
			});

			expect(querySpy).toHaveBeenCalledTimes(4);
			for (const [sql, params] of querySpy.mock.calls as [string, unknown[]][]) {
				for (const value of Object.values(sentinels)) {
					expect(sql).not.toContain(String(value));
				}
				const placeholders = [...new Set(sql.match(/\$\d+/g))].map((placeholder) =>
					Number(placeholder.slice(1)),
				);
				expect([...placeholders].sort((a, b) => a - b)).toEqual(
					params.map((_, index) => index + 1),
				);
			}
		});
	});
});
