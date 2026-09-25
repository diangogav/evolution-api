import type { TierLadder } from "./TierCatalog";
import type { TierStanding } from "./TierReplay";

/** A player already placed in the leaderboard total order, with their replay. */
export type MasterCandidate = { userId: string; standing: TierStanding };

function masterOf(ladder: TierLadder) {
	return ladder.tiers.find((tier) => tier.kind === "relative");
}

/** Enough active games and the required tier granted at some point of the replay. */
export function isMasterEligible(standing: TierStanding, ladder: TierLadder): boolean {
	const master = masterOf(ladder);
	if (!master) return false;

	const required = ladder.tiers.find((tier) => tier.id === master.requiresTier);
	const granted = ladder.tiers.find((tier) => tier.id === standing.grantedTierId);

	return (
		standing.gamesPlayed >= (master.minGames ?? 0) &&
		(required === undefined || (granted !== undefined && granted.order >= required.order))
	);
}

/**
 * The user ids that hold Master: the first eligible candidates in the given
 * order, exactly as many as the ladder seats, or nobody when the seats cannot
 * all be filled. The tie-break already lives in the candidate order.
 */
export function selectMaster(ordered: MasterCandidate[], ladder: TierLadder): string[] {
	const size = masterOf(ladder)?.size ?? 0;
	const selected: string[] = [];

	for (const candidate of ordered) {
		if (selected.length === size) break;
		if (isMasterEligible(candidate.standing, ladder)) selected.push(candidate.userId);
	}

	return selected.length === size && size > 0 ? selected : [];
}
