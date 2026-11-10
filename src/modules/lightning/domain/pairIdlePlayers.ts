export type PairingCandidate = {
	userId: string;
	score: number;
	idleSince: Date | null;
	lastOpponentId: string | null;
};

/** Seat 0 is the better-placed player of the pair. */
export type Pairing = { seat0: string; seat1: string };

export type PairingOptions = {
	/** Whether two players who just met may face each other again when nobody else is idle. */
	allowRematch?: boolean;
};

/**
 * Pairs idle players by score (highest first), the longest wait first among equals. Each
 * player takes the best-placed idle player who is not their last opponent. When only the
 * last opponent is left, the player waits for someone else to finish, unless rematches are
 * allowed. An odd player waits for the next tick: there are no byes.
 */
export function pairIdlePlayers(
	candidates: PairingCandidate[],
	options: PairingOptions = {},
): Pairing[] {
	const remaining = [...candidates].sort(byScoreThenWait);
	const pairs: Pairing[] = [];
	while (remaining.length >= 2) {
		const player = remaining.shift() as PairingCandidate;
		let partnerIndex = remaining.findIndex((other) => !isRematch(player, other));
		if (partnerIndex < 0 && options.allowRematch) partnerIndex = 0;
		if (partnerIndex < 0) continue;
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
