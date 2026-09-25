import { beforeEach, describe, expect, it, mock } from "bun:test";

import {
	TierResolver,
	toTierView,
} from "../../../../../src/modules/tiers/application/TierResolver";
import { ladderFor } from "../../../../../src/modules/tiers/domain/TierCatalog";
import type { TierGame } from "../../../../../src/modules/tiers/domain/TierGame";
import type { TierStanding } from "../../../../../src/modules/tiers/domain/TierReplay";
import type {
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

describe("TierResolver.forPlayer", () => {
	let repository: TiersRepository;
	let resolver: TierResolver;

	beforeEach(() => {
		repository = {
			findEligibleRanks: mock(async () => [] as TierRank[]),
			findTierGames: mock(async () => [] as TierGame[]),
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
