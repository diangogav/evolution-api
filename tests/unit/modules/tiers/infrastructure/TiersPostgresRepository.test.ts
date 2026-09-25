import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { dataSource } from "../../../../../src/evolution-types/src/data-source";
import { BACKFILL_CUTOFF } from "../../../../../src/modules/tiers/domain/TierGame";
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

		it("passes user ids, rank ids, season and the backfill cutoff literal as the four positional parameters", async () => {
			const rows = [tierGame({ gameId: "g1" }), tierGame({ gameId: "g2", won: false })];
			querySpy.mockResolvedValueOnce(rows);

			expect(await repository.findTierGames(query)).toEqual(rows);

			expect(querySpy).toHaveBeenCalledTimes(1);
			const [, params] = querySpy.mock.calls[0] as [string, unknown[]];
			expect(params).toEqual([["u1"], ["rank-tcg", "rank-edison"], 7, BACKFILL_CUTOFF]);
			expect(typeof params[3]).toBe("string");
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

		it("projects the replay row: epoch-ms timestamps, a duel time only before the cutoff and the applied opponent of the same rank", async () => {
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
			expect(sql).toContain("CASE WHEN g.applied_at < $4 THEN");
			expect(sql).toContain("FROM duels d WHERE d.game_id = g.game_id");
			expect(sql).toContain("(EXTRACT(EPOCH FROM MIN(d.date)) * 1000)::float8");
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
});
