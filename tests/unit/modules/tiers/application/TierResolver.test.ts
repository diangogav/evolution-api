import { beforeEach, describe, expect, it, mock } from "bun:test";

import {
	MASTER_CANDIDATE_BATCH,
	TierResolver,
	toTierView,
} from "../../../../../src/modules/tiers/application/TierResolver";
import { ladderFor } from "../../../../../src/modules/tiers/domain/TierCatalog";
import type { TierGame } from "../../../../../src/modules/tiers/domain/TierGame";
import type { TierStanding } from "../../../../../src/modules/tiers/domain/TierReplay";
import type {
	MasterCandidatesQuery,
	MasterRating,
	MasterRatingsQuery,
	TierGamesQuery,
	TierRank,
	TiersRepository,
} from "../../../../../src/modules/tiers/domain/TiersRepository";
import { tcgGoldThenLosses, tierGame } from "../fixtures/season7Slices";

const TCG: TierRank = { id: "rank-tcg", name: "TCG" };
const EDISON: TierRank = { id: "rank-edison", name: "Edison" };

/** Five +2 wins over distinct opponents on distinct days: Gold at 10 points with the gate met. */
const fiveWins = (rankId: string): TierGame[] =>
	Array.from({ length: 5 }, (_, index) =>
		tierGame({
			gameId: `${rankId}-g${index + 1}`,
			appliedId: `${rankId}-a${index + 1}`,
			rankId,
			opponentId: `o${index + 1}`,
			appliedAt: Date.UTC(2026, 8, 15 + index, 12),
		}),
	);

/** One game per entry, each on its own UTC day against its own opponent, so no daily cap applies. */
const games = (userId: string, deltas: number[], rankId = TCG.id): TierGame[] =>
	deltas.map((pointsDelta, index) =>
		tierGame({
			gameId: `${userId}-g${index + 1}`,
			appliedId: `${userId}-a${index + 1}`,
			userId,
			rankId,
			opponentId: `o${index + 1}`,
			pointsDelta,
			won: pointsDelta > 0,
			appliedAt: Date.UTC(2026, 8, 15 + index, 12),
		}),
	);
const twos = (count: number): number[] => Array.from({ length: count }, () => 2);
const zeros = (count: number): number[] => Array.from({ length: count }, () => 0);
/** 40 points over 20 games: Diamond, Master eligible. */
const diamondVeteran = (userId: string): TierGame[] => games(userId, twos(20));
/** 26 points over 20 games: Platinum, Master eligible. */
const platinumVeteran = (userId: string): TierGame[] => games(userId, [...twos(13), ...zeros(7)]);
/** 24 points over 20 games: Gold, enough games but Platinum never reached. */
const goldVeteran = (userId: string): TierGame[] => games(userId, [...twos(12), ...zeros(8)]);
/** 26 points over 13 games: Platinum reached but too few games. */
const platinumNovice = (userId: string): TierGame[] => games(userId, twos(13));

const elo = (userId: string, rating = 1200, peak = 1250): MasterRating => ({
	userId,
	rating,
	peak,
});

/** Serves rows from a pool by user and rank, candidates by page and ratings by id, so call arguments stay observable. */
const fakeRepository = (
	pool: TierGame[],
	candidates: string[] = [],
	ratings: MasterRating[] = [],
): TiersRepository => ({
	findEligibleRanks: mock(async (names: string[]) =>
		[TCG, EDISON].filter((rank) => names.includes(rank.name)),
	),
	findTierGames: mock(async ({ userIds, rankIds }: TierGamesQuery) =>
		pool.filter((game) => userIds.includes(game.userId) && rankIds.includes(game.rankId)),
	),
	findMasterCandidates: mock(async ({ limit, offset }: MasterCandidatesQuery) =>
		candidates.slice(offset, offset + limit),
	),
	findMasterRatings: mock(async ({ userIds }: MasterRatingsQuery) =>
		ratings.filter((rating) => userIds.includes(rating.userId)),
	),
});

const firstBatch = {
	rankId: TCG.id,
	season: 7,
	minGames: 20,
	limit: MASTER_CANDIDATE_BATCH,
	offset: 0,
};

const masterView = (effectivePoints: number, rating: MasterRating) => ({
	id: "master",
	name: "Master",
	effectivePoints,
	gamesPlayed: 20,
	progress: null,
	rating: rating.rating,
	peak: rating.peak,
});

describe("TierResolver.forPlayer", () => {
	let repository: TiersRepository;
	let resolver: TierResolver;

	beforeEach(() => {
		repository = {
			findEligibleRanks: mock(async () => [] as TierRank[]),
			findTierGames: mock(async () => [] as TierGame[]),
			findMasterCandidates: mock(async () => [] as string[]),
			findMasterRatings: mock(async () => [] as MasterRating[]),
		};
		resolver = new TierResolver(repository);
	});

	it("keys the result by rank name and leaves unknown and global ranks out", async () => {
		repository.findEligibleRanks = mock(async () => [TCG]);

		const tiers = await resolver.forPlayer({
			userId: "u1",
			season: 7,
			rankNames: ["TCG", "Global", "Unknown"],
		});

		expect([...tiers.keys()]).toEqual(["TCG"]);
		expect(repository.findEligibleRanks).toHaveBeenCalledWith(["TCG", "Global", "Unknown"]);
		expect(repository.findTierGames).toHaveBeenCalledWith({
			userIds: ["u1"],
			rankIds: ["rank-tcg"],
			season: 7,
		});
	});

	it("returns an empty map and reads no games when no rank is tiered", async () => {
		const tiers = await resolver.forPlayer({ userId: "u1", season: 7, rankNames: ["Global"] });

		expect(tiers.size).toBe(0);
		expect(repository.findTierGames).not.toHaveBeenCalled();
	});

	it("maps a player with no active games in a tiered rank to Rookie with zero games", async () => {
		repository.findEligibleRanks = mock(async () => [TCG]);

		const tiers = await resolver.forPlayer({ userId: "u1", season: 7, rankNames: ["TCG"] });

		expect(tiers.get("TCG")).toEqual({
			id: "rookie",
			name: "Rookie",
			effectivePoints: 0,
			gamesPlayed: 0,
			progress: {
				nextTierId: "bronze",
				unit: "games",
				current: 0,
				target: 5,
				distinctOpponentWins: null,
			},
		});
	});

	it("replays each rank's own rows, so one rank's games never reach another rank's tier", async () => {
		repository.findEligibleRanks = mock(async () => [TCG, EDISON]);
		repository.findTierGames = mock(async () => [
			...fiveWins("rank-tcg"),
			...fiveWins("rank-edison").slice(0, 2),
		]);

		const tiers = await resolver.forPlayer({
			userId: "u1",
			season: 7,
			rankNames: ["TCG", "Edison"],
		});

		expect(tiers.get("TCG")).toEqual({
			id: "gold",
			name: "Gold",
			effectivePoints: 10,
			gamesPlayed: 5,
			progress: {
				nextTierId: "platinum",
				unit: "points",
				current: 10,
				target: 25,
				distinctOpponentWins: { current: 5, required: 5 },
			},
		});
		expect(tiers.get("Edison")).toMatchObject({ id: "rookie", gamesPlayed: 2, effectivePoints: 4 });
	});

	it("exposes the real TCG floor holder as Gold without rating or peak", async () => {
		repository.findEligibleRanks = mock(async () => [TCG]);
		repository.findTierGames = mock(async () => tcgGoldThenLosses);

		const view = (await resolver.forPlayer({ userId: "p1", season: 7, rankNames: ["TCG"] })).get(
			"TCG",
		);

		expect(view).toMatchObject({ id: "gold", name: "Gold", effectivePoints: 11, gamesPlayed: 18 });
		expect(view).not.toHaveProperty("rating");
		expect(view).not.toHaveProperty("peak");
	});

	it("resolves Master for a player who is Platinum or better with at least 20 games, in that rank only", async () => {
		const seated = ["u1", "c2", "c3", "c4", "c5"];
		repository = fakeRepository(
			[
				...diamondVeteran("u1"),
				...games("u1", twos(2), EDISON.id),
				...seated.slice(1).flatMap(platinumVeteran),
			],
			seated,
			[elo("u1", 1300, 1320), ...seated.slice(1).map((id) => elo(id))],
		);

		const tiers = await new TierResolver(repository).forPlayer({
			userId: "u1",
			season: 7,
			rankNames: ["TCG", "Edison"],
		});

		expect(tiers.get("TCG")).toEqual(masterView(40, elo("u1", 1300, 1320)));
		expect(Object.keys(tiers.get("TCG") ?? {})).toEqual([
			"id",
			"name",
			"effectivePoints",
			"gamesPlayed",
			"progress",
			"rating",
			"peak",
		]);
		expect(tiers.get("Edison")).toMatchObject({ id: "rookie", gamesPlayed: 2 });
		expect(repository.findMasterCandidates).toHaveBeenCalledTimes(1);
		expect(repository.findMasterCandidates).toHaveBeenCalledWith(firstBatch);
		expect(repository.findMasterRatings).toHaveBeenCalledWith({
			rankId: TCG.id,
			season: 7,
			userIds: seated,
		});
	});

	it("reads no Master candidates for a player who never reached Platinum or has fewer than 20 games", async () => {
		for (const [pool, expected] of [
			[goldVeteran("u1"), { id: "gold", gamesPlayed: 20 }],
			[platinumNovice("u1"), { id: "platinum", gamesPlayed: 13 }],
		] as const) {
			repository = fakeRepository([...pool], ["u1"], [elo("u1")]);

			const tiers = await new TierResolver(repository).forPlayer({
				userId: "u1",
				season: 7,
				rankNames: ["TCG"],
			});

			expect(tiers.get("TCG")).toMatchObject(expected);
			expect(repository.findMasterCandidates).not.toHaveBeenCalled();
			expect(repository.findMasterRatings).not.toHaveBeenCalled();
		}
	});

	it("keeps an eligible player the candidate order leaves out of the seats at the tier the replay produced", async () => {
		const seated = ["c1", "c2", "c3", "c4", "c5"];
		repository = fakeRepository(
			[...seated.flatMap(diamondVeteran), ...platinumVeteran("u1")],
			[...seated, "u1"],
			[...seated, "u1"].map((id) => elo(id)),
		);

		const view = (
			await new TierResolver(repository).forPlayer({ userId: "u1", season: 7, rankNames: ["TCG"] })
		).get("TCG");

		expect(view).toEqual({
			id: "platinum",
			name: "Platinum",
			effectivePoints: 26,
			gamesPlayed: 20,
			progress: {
				nextTierId: "diamond",
				unit: "points",
				current: 26,
				target: 40,
				distinctOpponentWins: { current: 13, required: 5 },
			},
		});
		expect(repository.findMasterRatings).toHaveBeenCalledWith({
			rankId: TCG.id,
			season: 7,
			userIds: seated,
		});
	});
});

describe("TierResolver.forLeaderboardPage", () => {
	const page = { rankName: "TCG", season: 7 };

	it("keys the page by user id, replays only those users in that rank, and maps users without rows to Rookie with zero games", async () => {
		const repository = fakeRepository([
			...games("u1", twos(5)),
			...games("u3", twos(2), EDISON.id),
		]);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1", "u2", "u3"],
		});

		expect([...tiers.keys()]).toEqual(["u1", "u2", "u3"]);
		expect(tiers.get("u1")).toMatchObject({ id: "gold", effectivePoints: 10, gamesPlayed: 5 });
		expect(tiers.get("u2")).toEqual({
			id: "rookie",
			name: "Rookie",
			effectivePoints: 0,
			gamesPlayed: 0,
			progress: {
				nextTierId: "bronze",
				unit: "games",
				current: 0,
				target: 5,
				distinctOpponentWins: null,
			},
		});
		expect(tiers.get("u3")).toMatchObject({ id: "rookie", gamesPlayed: 0 });
		expect(repository.findEligibleRanks).toHaveBeenCalledWith(["TCG"]);
		expect(repository.findTierGames).toHaveBeenCalledTimes(1);
		expect(repository.findTierGames).toHaveBeenCalledWith({
			userIds: ["u1", "u2", "u3"],
			rankIds: [TCG.id],
			season: 7,
		});
	});

	it("returns an empty map and reads no games when the rank is not tiered", async () => {
		const repository = fakeRepository(games("u1", twos(5)));

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			rankName: "Global",
			season: 7,
			userIds: ["u1"],
		});

		expect(tiers.size).toBe(0);
		expect(repository.findTierGames).not.toHaveBeenCalled();
	});

	it("returns an empty map and reads nothing for an empty page", async () => {
		const repository = fakeRepository(games("u1", twos(5)));

		const tiers = await new TierResolver(repository).forLeaderboardPage({ ...page, userIds: [] });

		expect(tiers.size).toBe(0);
		expect(repository.findEligibleRanks).not.toHaveBeenCalled();
	});

	it("leaves Master unresolved while nobody on the page is eligible", async () => {
		const repository = fakeRepository(
			[...goldVeteran("u1"), ...platinumNovice("u2")],
			["u1", "u2"],
			[elo("u1"), elo("u2")],
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1", "u2"],
		});

		expect(tiers.get("u1")).toMatchObject({ id: "gold", gamesPlayed: 20 });
		expect(tiers.get("u2")).toMatchObject({ id: "platinum", gamesPlayed: 13 });
		expect(repository.findMasterCandidates).not.toHaveBeenCalled();
		expect(repository.findMasterRatings).not.toHaveBeenCalled();
	});

	it("seats the page's eligible players the candidate order selects, with rating and peak read for the seated ids only", async () => {
		const seated = ["u1", "c2", "c3", "c4", "c5"];
		const repository = fakeRepository(
			[
				...diamondVeteran("u1"),
				...games("u2", twos(5)),
				...seated.slice(1).flatMap(platinumVeteran),
			],
			seated,
			[elo("u1", 1300, 1320), elo("u2", 1400, 1400), ...seated.slice(1).map((id) => elo(id))],
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1", "u2"],
		});

		expect(tiers.get("u1")).toEqual(masterView(40, elo("u1", 1300, 1320)));
		expect(tiers.get("u2")).toMatchObject({ id: "gold" });
		expect(tiers.get("u2")).not.toHaveProperty("rating");
		expect(repository.findMasterCandidates).toHaveBeenCalledTimes(1);
		expect(repository.findMasterCandidates).toHaveBeenCalledWith(firstBatch);
		expect(repository.findMasterRatings).toHaveBeenCalledTimes(1);
		expect(repository.findMasterRatings).toHaveBeenCalledWith({
			rankId: TCG.id,
			season: 7,
			userIds: seated,
		});
	});

	it("reuses the page's replays, reading rows only for candidates the request has not replayed yet", async () => {
		const seated = ["u1", "c2", "c3", "c4", "c5"];
		const repository = fakeRepository(
			[
				...diamondVeteran("u1"),
				...games("u2", twos(5)),
				...seated.slice(1).flatMap(platinumVeteran),
			],
			seated,
			seated.map((id) => elo(id)),
		);

		await new TierResolver(repository).forLeaderboardPage({ ...page, userIds: ["u1", "u2"] });

		expect((repository.findTierGames as ReturnType<typeof mock>).mock.calls).toEqual([
			[{ userIds: ["u1", "u2"], rankIds: [TCG.id], season: 7 }],
			[{ userIds: ["c2", "c3", "c4", "c5"], rankIds: [TCG.id], season: 7 }],
		]);
	});

	it("keeps an eligible page user the candidate order leaves out of the seats at the tier the replay produced", async () => {
		const seated = ["c1", "c2", "c3", "c4", "c5"];
		const repository = fakeRepository(
			[...seated.flatMap(diamondVeteran), ...platinumVeteran("u6")],
			[...seated, "u6"],
			[...seated, "u6"].map((id) => elo(id)),
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u6"],
		});

		expect(tiers.get("u6")).toMatchObject({ id: "platinum", effectivePoints: 26, gamesPlayed: 20 });
		expect(tiers.get("u6")).not.toHaveProperty("rating");
		expect(repository.findMasterRatings).toHaveBeenCalledWith({
			rankId: TCG.id,
			season: 7,
			userIds: seated,
		});
	});

	it("pages candidates in batches of 50 and stops as soon as five eligible players are confirmed", async () => {
		const candidates = Array.from({ length: 120 }, (_, index) => `c${index + 1}`);
		candidates[109] = "u1";
		const seated = ["c3", "c40", "c51", "c60", "c99"];
		const repository = fakeRepository(
			[...seated, "c101", "u1"].flatMap(diamondVeteran),
			candidates,
			[...seated, "c101", "u1"].map((id) => elo(id)),
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1"],
		});

		const batches = (repository.findMasterCandidates as ReturnType<typeof mock>).mock.calls;
		expect(batches).toEqual([[firstBatch], [{ ...firstBatch, offset: 50 }]]);
		expect(repository.findMasterRatings).toHaveBeenCalledWith({
			rankId: TCG.id,
			season: 7,
			userIds: seated,
		});
		expect(tiers.get("u1")).toMatchObject({ id: "diamond", gamesPlayed: 20 });
		expect(tiers.get("u1")).not.toHaveProperty("rating");
	});

	it("leaves every seat empty when a full batch is followed by no more candidates before five are eligible", async () => {
		const candidates = Array.from({ length: 50 }, (_, index) => `c${index + 1}`);
		candidates[0] = "u1";
		const repository = fakeRepository(
			["u1", "c2", "c3", "c4"].flatMap(diamondVeteran),
			candidates,
			["u1", "c2", "c3", "c4"].map((id) => elo(id)),
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1"],
		});

		const batches = (repository.findMasterCandidates as ReturnType<typeof mock>).mock.calls;
		expect(batches).toEqual([[firstBatch], [{ ...firstBatch, offset: 50 }]]);
		expect(tiers.get("u1")).toMatchObject({ id: "diamond", gamesPlayed: 20 });
		expect(tiers.get("u1")).not.toHaveProperty("rating");
		expect(repository.findMasterRatings).not.toHaveBeenCalled();
	});

	it("stops paging after a short batch and leaves every seat empty when fewer than five are eligible", async () => {
		const repository = fakeRepository(
			["u1", "c2", "c3"].flatMap(diamondVeteran),
			["u1", "c2", "c3"],
			["u1", "c2", "c3"].map((id) => elo(id)),
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1"],
		});

		expect(repository.findMasterCandidates).toHaveBeenCalledTimes(1);
		expect(tiers.get("u1")).toMatchObject({ id: "diamond", gamesPlayed: 20 });
		expect(repository.findMasterRatings).not.toHaveBeenCalled();
	});

	it("keeps a seated player at Master without rating or peak when player_ratings has no row", async () => {
		const seated = ["u1", "c2", "c3", "c4", "c5"];
		const repository = fakeRepository(
			seated.flatMap(diamondVeteran),
			seated,
			seated.slice(1).map((id) => elo(id)),
		);

		const tiers = await new TierResolver(repository).forLeaderboardPage({
			...page,
			userIds: ["u1"],
		});

		expect(tiers.get("u1")).toEqual({
			id: "master",
			name: "Master",
			effectivePoints: 40,
			gamesPlayed: 20,
			progress: null,
		});
	});
});

describe("toTierView", () => {
	const ladder = ladderFor();

	it("names the tier from the ladder and carries the standing's points, games and progress", () => {
		const standing: TierStanding = {
			tierId: "silver",
			grantedTierId: "silver",
			effectivePoints: 5,
			gamesPlayed: 9,
			distinctOpponentWins: 3,
			progress: {
				nextTierId: "gold",
				unit: "points",
				current: 5,
				target: 10,
				distinctOpponentWins: null,
			},
		};

		expect(toTierView(standing, ladder)).toEqual({
			id: "silver",
			name: "Silver",
			effectivePoints: 5,
			gamesPlayed: 9,
			progress: standing.progress,
		});
	});

	it("keeps a null progress at Diamond and never adds rating or peak keys", () => {
		const diamond: TierStanding = {
			tierId: "diamond",
			grantedTierId: "diamond",
			effectivePoints: 44,
			gamesPlayed: 30,
			distinctOpponentWins: 8,
			progress: null,
		};

		const view = toTierView(diamond, ladder);

		expect(view).toEqual({
			id: "diamond",
			name: "Diamond",
			effectivePoints: 44,
			gamesPlayed: 30,
			progress: null,
		});
		expect(Object.keys(view)).toEqual(["id", "name", "effectivePoints", "gamesPlayed", "progress"]);
	});
});
