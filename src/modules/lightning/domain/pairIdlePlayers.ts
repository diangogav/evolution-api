export type PairingCandidate = {
	userId: string;
	score: number;
	idleSince: Date | null;
	lastOpponentId: string | null;
};

/** Seat 0 is the better-placed player of the pair. */
export type Pairing = { seat0: string; seat1: string };

// How far down the list a player looks for someone other than their last opponent before
// accepting the rematch. Small on purpose: the arena pairs by score, not by novelty.
const REMATCH_LOOKAHEAD = 3;

/**
 * Pairs idle players by score (highest first), the longest wait first among equals. Walks
 * the sorted list pairing neighbours, skipping an immediate rematch when another partner
 * sits close enough. An odd player waits for the next tick: there are no byes.
 */
export function pairIdlePlayers(candidates: PairingCandidate[]): Pairing[] {
	const remaining = [...candidates].sort(byScoreThenWait);
	const pairs: Pairing[] = [];
	while (remaining.length >= 2) {
		const player = remaining.shift() as PairingCandidate;
		let partnerIndex = 0;
		if (isRematch(player, remaining[0])) {
			const alternative = remaining
				.slice(1, 1 + REMATCH_LOOKAHEAD)
				.findIndex((other) => !isRematch(player, other));
			if (alternative >= 0) partnerIndex = alternative + 1;
		}
		const [partner] = remaining.splice(partnerIndex, 1);
		pairs.push({ seat0: player.userId, seat1: partner.userId });
	}
	return pairs;
}

function isRematch(a: PairingCandidate, b: PairingCandidate): boolean {
	return a.lastOpponentId === b.userId || b.lastOpponentId === a.userId;
}

// A missing idle timestamp sorts first: it belongs to a player waiting since before the
// clock was set. User id closes every tie so two ticks sort identically.
function byScoreThenWait(a: PairingCandidate, b: PairingCandidate): number {
	if (a.score !== b.score) return b.score - a.score;
	const waitA = a.idleSince?.getTime() ?? Number.NEGATIVE_INFINITY;
	const waitB = b.idleSince?.getTime() ?? Number.NEGATIVE_INFINITY;
	if (waitA !== waitB) return waitA < waitB ? -1 : 1;
	return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}
