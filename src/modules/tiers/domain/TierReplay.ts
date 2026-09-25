import type { TierDefinition, TierId, TierLadder } from "./TierCatalog";
import { compareTierGames, gameTime, type TierGame, utcDay } from "./TierGame";

export type TierProgress = {
	nextTierId: TierId;
	unit: "games" | "points";
	current: number;
	target: number;
	/** Present when the next tier requires wins over distinct opponents. */
	distinctOpponentWins: { current: number; required: number } | null;
};

export type TierStanding = {
	tierId: Exclude<TierId, "master">;
	/** Highest tier ever granted during the replay; ignores the Rookie gate. */
	grantedTierId: Exclude<TierId, "rookie" | "master">;
	effectivePoints: number;
	/** Every active game, uncapped. */
	gamesPlayed: number;
	/** Distinct opponents beaten over every active game, uncapped. */
	distinctOpponentWins: number;
	/** Null once the ladder has no absolute tier above the current one. */
	progress: TierProgress | null;
};

type Granted = TierDefinition & { id: TierStanding["grantedTierId"] };

function isGrantable(tier: TierDefinition): tier is Granted {
	return tier.kind === "absolute";
}

function qualifies(tier: TierDefinition, effectivePoints: number, beaten: number): boolean {
	return (
		(tier.threshold === null || effectivePoints >= tier.threshold) &&
		(tier.distinctOpponentWins === null || beaten >= tier.distinctOpponentWins)
	);
}

/**
 * Folds a player's active games, in replay order, into their standing. Each
 * game counts toward the totals; its points move the running value only
 * while it is within the daily per-opponent cap, and the running value never
 * drops below the threshold of the highest tier granted so far. Until a tier
 * is granted there is no floor at all, so the value may go negative. A tier
 * is granted the moment its threshold and its distinct-opponent requirement
 * hold at once; the Rookie gate is applied last and never touches the floor.
 */
export function replayTier(games: TierGame[], ladder: TierLadder): TierStanding {
	const grantable = ladder.tiers.filter(isGrantable);
	const lowest = grantable[0];
	if (lowest === undefined) throw new Error("replayTier: the ladder has no absolute tier");
	const rookie = ladder.tiers.find((tier) => tier.kind === "placement");
	const beaten = new Set<string>();
	const dailyGames = new Map<string, number>();
	let granted = lowest;
	let lockedFloor: number | null = null;
	let effectivePoints = 0;
	let gamesPlayed = 0;

	for (const game of [...games].sort(compareTierGames)) {
		gamesPlayed++;
		if (game.won && game.opponentId !== null) beaten.add(game.opponentId);

		let delta = game.pointsDelta;
		if (game.opponentId !== null) {
			const key = `${utcDay(gameTime(game))}|${game.opponentId}`;
			const played = dailyGames.get(key) ?? 0;
			dailyGames.set(key, played + 1);
			if (played >= ladder.dailyOpponentCap) delta = 0;
		}
		effectivePoints += delta;
		if (lockedFloor !== null) effectivePoints = Math.max(lockedFloor, effectivePoints);

		for (const tier of grantable) {
			if (tier.order > granted.order && qualifies(tier, effectivePoints, beaten.size)) {
				granted = tier;
				lockedFloor = tier.threshold ?? lockedFloor;
			}
		}
	}

	const rookieMinGames = rookie?.minGames ?? 0;
	const isRookie = gamesPlayed < rookieMinGames;
	const next = isRookie ? grantable[0] : grantable[grantable.indexOf(granted) + 1];

	return {
		tierId: isRookie ? "rookie" : granted.id,
		grantedTierId: granted.id,
		effectivePoints,
		gamesPlayed,
		distinctOpponentWins: beaten.size,
		progress: progressTo(next, isRookie, {
			gamesPlayed,
			effectivePoints,
			beaten: beaten.size,
			rookieMinGames,
		}),
	};
}

function progressTo(
	next: TierDefinition | undefined,
	isRookie: boolean,
	state: { gamesPlayed: number; effectivePoints: number; beaten: number; rookieMinGames: number },
): TierProgress | null {
	if (!next) return null;
	if (isRookie) {
		return {
			nextTierId: next.id,
			unit: "games",
			current: state.gamesPlayed,
			target: state.rookieMinGames,
			distinctOpponentWins: null,
		};
	}
	return {
		nextTierId: next.id,
		unit: "points",
		current: state.effectivePoints,
		target: next.threshold ?? 0,
		distinctOpponentWins:
			next.distinctOpponentWins === null
				? null
				: { current: state.beaten, required: next.distinctOpponentWins },
	};
}
