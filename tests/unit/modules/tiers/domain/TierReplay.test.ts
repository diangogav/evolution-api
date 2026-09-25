import { describe, expect, it } from "bun:test";

import { ladderFor, TIER_CATALOG } from "../../../../../src/modules/tiers/domain/TierCatalog";
import type { TierGame } from "../../../../../src/modules/tiers/domain/TierGame";
import { replayTier } from "../../../../../src/modules/tiers/domain/TierReplay";
import {
	edisonSameDaySession,
	tcgGoldThenLosses,
	tcgReinstatedGame,
	tcgReinstatedWindow,
	tcgWinTrading,
	tierGame,
} from "../fixtures/season7Slices";

const ladder = ladderFor();
const replay = (games: TierGame[]) => replayTier(games, ladder);

type Shape = { opponentOf?: (index: number) => string | null; dayOf?: (index: number) => number };

/** Post-cutoff games, one per UTC day against a fresh opponent unless shaped otherwise. */
function games(deltas: number[], shape: Shape = {}): TierGame[] {
	const opponentOf = shape.opponentOf ?? ((index) => `o${index + 1}`);
	const dayOf = shape.dayOf ?? ((index) => index);

	return deltas.map((pointsDelta, index) =>
		tierGame({
			gameId: `g${index + 1}`,
			appliedId: `a${index + 1}`,
			opponentId: opponentOf(index),
			pointsDelta,
			won: pointsDelta > 0,
			appliedAt: Date.UTC(2026, 8, 15 + dayOf(index), 12, index),
		}),
	);
}

const sameOpponent = { opponentOf: () => "o1" };
const sameDay = { dayOf: () => 0 };
const ones = (count: number) => Array.from({ length: count }, () => 1);

describe("replayTier: Rookie minimum", () => {
	it("keeps a player with four active games at Rookie while points already accrue", () => {
		expect(replay(games([2, 2, 2, 2]))).toEqual({
			tierId: "rookie",
			grantedTierId: "silver",
			effectivePoints: 8,
			gamesPlayed: 4,
			distinctOpponentWins: 4,
			progress: {
				nextTierId: "bronze",
				unit: "games",
				current: 4,
				target: 5,
				distinctOpponentWins: null,
			},
		});
	});

	it("leaves Rookie on the fifth game and lands on Bronze below the Silver threshold", () => {
		expect(replay(games([-1, -1, -1, -1, -1]))).toEqual({
			tierId: "bronze",
			grantedTierId: "bronze",
			effectivePoints: -5,
			gamesPlayed: 5,
			distinctOpponentWins: 0,
			progress: {
				nextTierId: "silver",
				unit: "points",
				current: -5,
				target: 3,
				distinctOpponentWins: null,
			},
		});
	});

	it("counts capped games toward the minimum even though they add no points", () => {
		const standing = replay(games([2, 2, 2, 2, 2], { ...sameOpponent, ...sameDay }));

		expect(standing).toMatchObject({ tierId: "silver", gamesPlayed: 5, effectivePoints: 4 });
	});

	it("reports an empty history as Rookie with zero progress", () => {
		expect(replay([])).toMatchObject({
			tierId: "rookie",
			effectivePoints: 0,
			gamesPlayed: 0,
			progress: { nextTierId: "bronze", unit: "games", current: 0, target: 5 },
		});
	});
});

describe("replayTier: thresholds", () => {
	it.each([
		[2, "bronze"],
		[3, "silver"],
		[9, "silver"],
		[10, "gold"],
		[24, "gold"],
		[25, "platinum"],
		[39, "platinum"],
		[40, "diamond"],
	])("assigns %i effective points with five beaten opponents to %s", (points, tierId) => {
		const standing = replay(games([points - 5, ...ones(5)]));
		const beaten = points - 5 > 0 ? 6 : 5;

		expect(standing).toMatchObject({
			tierId,
			effectivePoints: points,
			distinctOpponentWins: beaten,
		});
	});

	it("caps a player at Gold while the Platinum points are met with only four beaten opponents", () => {
		const fourOpponents = { opponentOf: (index: number) => (index === 0 ? "o2" : `o${index + 1}`) };

		expect(replay(games([26, 1, 1, 1, 1], fourOpponents))).toEqual({
			tierId: "gold",
			grantedTierId: "gold",
			effectivePoints: 30,
			gamesPlayed: 5,
			distinctOpponentWins: 4,
			progress: {
				nextTierId: "platinum",
				unit: "points",
				current: 30,
				target: 25,
				distinctOpponentWins: { current: 4, required: 5 },
			},
		});
	});

	it("grants Platinum on the very game that beats the fifth distinct opponent", () => {
		const fourOpponents = { opponentOf: (index: number) => (index === 0 ? "o2" : `o${index + 1}`) };

		expect(replay(games([26, 1, 1, 1, 1, 1], fourOpponents))).toMatchObject({
			tierId: "platinum",
			effectivePoints: 31,
			distinctOpponentWins: 5,
		});
	});

	it("reads thresholds from the ladder it is given", () => {
		const raised = ladderFor("Raised", {
			defaults: TIER_CATALOG.defaults,
			overrides: { Raised: { diamond: { threshold: 50 } } },
		});

		expect(replayTier(games([35, ...ones(5)]), raised).tierId).toBe("platinum");
		expect(replayTier(games([45, ...ones(5)]), raised).tierId).toBe("diamond");
	});
});

describe("replayTier: floors", () => {
	it("holds effective points at the Gold floor after losses that would otherwise reach 5", () => {
		const standing = replay(games([12, -1, -1, -1, -1, -1, -1, -1]));

		expect(standing).toMatchObject({ tierId: "gold", effectivePoints: 10, gamesPlayed: 8 });
	});

	it("locks the Silver floor on the game that reaches 3 points", () => {
		expect(replay(games([1, 1, 1, -5, -5]))).toMatchObject({
			tierId: "silver",
			effectivePoints: 3,
		});
	});

	it("has no floor below Silver, so Bronze points go negative", () => {
		expect(replay(games([-2, -2, -2, 1, 1]))).toMatchObject({
			tierId: "bronze",
			effectivePoints: -4,
		});
	});

	it("never locks the Platinum floor while the distinct-opponent gate is unmet", () => {
		const standing = replay(games([26, -3, -3, -3, -2]));

		expect(standing).toMatchObject({
			tierId: "gold",
			effectivePoints: 15,
			distinctOpponentWins: 1,
		});
	});

	it("does not grant Platinum retroactively when the gate is met after the points dropped", () => {
		const standing = replay(games([26, -3, -3, -3, -2, 1, 1, 1, 1]));

		expect(standing).toMatchObject({
			tierId: "gold",
			effectivePoints: 19,
			distinctOpponentWins: 5,
		});
	});

	it("locks the Platinum floor once points and gate are met together, then holds it", () => {
		const standing = replay(games([20, 1, 1, 1, 1, 1, -2, -2, -2, -2, -2]));

		expect(standing).toMatchObject({
			tierId: "platinum",
			effectivePoints: 25,
			distinctOpponentWins: 6,
		});
	});

	it("keeps the Gold floor a real TCG player earned before a losing streak", () => {
		expect(replay(tcgGoldThenLosses)).toEqual({
			tierId: "gold",
			grantedTierId: "gold",
			effectivePoints: 11,
			gamesPlayed: 18,
			distinctOpponentWins: 9,
			progress: {
				nextTierId: "platinum",
				unit: "points",
				current: 11,
				target: 25,
				distinctOpponentWins: { current: 9, required: 5 },
			},
		});
	});
});

describe("replayTier: daily per-opponent cap", () => {
	it("counts only the first two games of a 3-3 same-day session against one opponent", () => {
		const session = games([2, 2, -2, -2, -2, 2], { ...sameOpponent, ...sameDay });

		expect(replay(session)).toMatchObject({
			tierId: "silver",
			effectivePoints: 4,
			gamesPlayed: 6,
			distinctOpponentWins: 1,
		});
	});

	it("replays the real Edison same-day session to four points instead of six", () => {
		expect(replay(edisonSameDaySession)).toMatchObject({
			tierId: "silver",
			effectivePoints: 4,
			gamesPlayed: 7,
			distinctOpponentWins: 1,
		});
	});

	it("resets the cap at UTC midnight", () => {
		const straddling = [23, 23.5, 23.98, 24.02, 24.5, 25].map((hour, index) =>
			tierGame({
				gameId: `g${index + 1}`,
				appliedId: `a${index + 1}`,
				opponentId: "o1",
				appliedAt: Date.UTC(2026, 8, 15) + hour * 3_600_000,
			}),
		);

		expect(replay(straddling)).toMatchObject({ effectivePoints: 8, gamesPlayed: 6 });
	});

	it("keys the cap per opponent within the day", () => {
		const split = games([2, 2, 2, 2, 2], {
			...sameDay,
			opponentOf: (index) => (index < 3 ? "o1" : "o2"),
		});

		expect(replay(split)).toMatchObject({ effectivePoints: 8, gamesPlayed: 5 });
	});

	it("uses the duel day, not the backfill day, for rows written before the cutoff", () => {
		const backfilled = [1, 2, 3].map((day) =>
			tierGame({
				gameId: `g${day}`,
				appliedId: `a${day}`,
				opponentId: "o1",
				appliedAt: Date.UTC(2026, 8, 9, 19, day),
				duelAt: Date.UTC(2026, 8, day),
			}),
		);

		expect(replay(backfilled).effectivePoints).toBe(6);
	});

	it("keeps twenty days of two-a-day win trading at Gold with one beaten opponent", () => {
		expect(replay(tcgWinTrading)).toEqual({
			tierId: "gold",
			grantedTierId: "gold",
			effectivePoints: 60,
			gamesPlayed: 40,
			distinctOpponentWins: 1,
			progress: {
				nextTierId: "platinum",
				unit: "points",
				current: 60,
				target: 25,
				distinctOpponentWins: { current: 1, required: 5 },
			},
		});
	});
});

describe("replayTier: games without an opponent row", () => {
	it("counts their points and never caps them, but a win does not beat anyone", () => {
		const standing = replay(
			games([2, 2, 2, 1, 1], { ...sameDay, opponentOf: (i) => (i < 3 ? null : `o${i}`) }),
		);

		expect(standing).toMatchObject({
			tierId: "silver",
			effectivePoints: 8,
			gamesPlayed: 5,
			distinctOpponentWins: 2,
		});
	});
});

describe("replayTier: annulment and reinstatement", () => {
	it("drops an annulled game from every total and restores it as one row at its original time", () => {
		const reinstated = replay([...tcgReinstatedWindow, tcgReinstatedGame]);

		expect(replay(tcgReinstatedWindow)).toMatchObject({
			tierId: "silver",
			effectivePoints: 4,
			gamesPlayed: 7,
			distinctOpponentWins: 2,
		});
		expect(reinstated).toMatchObject({
			tierId: "silver",
			effectivePoints: 6,
			gamesPlayed: 8,
			distinctOpponentWins: 3,
		});
		expect(replay([tcgReinstatedGame, ...tcgReinstatedWindow])).toEqual(reinstated);
	});

	it("does not depend on the order the rows arrive in and leaves the input untouched", () => {
		const reversed = [...tcgGoldThenLosses].reverse();
		const snapshot = [...reversed];

		expect(replay(reversed)).toEqual(replay(tcgGoldThenLosses));
		expect(reversed).toEqual(snapshot);
	});
});

describe("replayTier: progress", () => {
	it("points Silver at Gold without a distinct-opponent requirement", () => {
		expect(replay(games([1, 1, 1, 1, 1])).progress).toEqual({
			nextTierId: "gold",
			unit: "points",
			current: 5,
			target: 10,
			distinctOpponentWins: null,
		});
	});

	it("shows a Gold player the Platinum gate exactly as the spec example does", () => {
		const twoWinsOverO2 = { opponentOf: (index: number) => (index === 4 ? "o2" : `o${index + 2}`) };

		expect(replay(games([13, 1, 1, 1, 1], twoWinsOverO2)).progress).toEqual({
			nextTierId: "platinum",
			unit: "points",
			current: 17,
			target: 25,
			distinctOpponentWins: { current: 4, required: 5 },
		});
	});

	it("shows a Platinum player the Diamond gate", () => {
		expect(replay(games([20, ...ones(5)])).progress).toEqual({
			nextTierId: "diamond",
			unit: "points",
			current: 25,
			target: 40,
			distinctOpponentWins: { current: 6, required: 5 },
		});
	});

	it("is null at Diamond, even after later losses", () => {
		expect(replay(games([35, ...ones(5), -2, -2]))).toMatchObject({
			tierId: "diamond",
			effectivePoints: 40,
			progress: null,
		});
	});
});

describe("replayTier: ladder validation", () => {
	it("refuses a ladder with no absolute tier instead of failing deep inside the fold", () => {
		const [rookie, , , , , , master] = TIER_CATALOG.defaults.tiers;
		const noAbsoluteTier = { tiers: [rookie, master], dailyOpponentCap: 2 };

		expect(() => replayTier([], noAbsoluteTier)).toThrow("ladder has no absolute tier");
		expect(() => replayTier(games([2, 2]), noAbsoluteTier)).toThrow("ladder has no absolute tier");
	});
});
