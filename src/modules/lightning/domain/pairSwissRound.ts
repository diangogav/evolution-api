import { Pairing } from "./pairIdlePlayers";

export type SwissPlayer = { userId: string; score: number };

export type SwissPairingInput = {
	/** Active players in standing order (best first); round one ignores the order. */
	players: SwissPlayer[];
	round: number;
	/** Fixes the round-one draw, so a retried tick pairs the same way. */
	seed: string;
	/** Every pair that already played in this tournament. */
	history: ReadonlyArray<readonly [string, string]>;
	hadBye: ReadonlySet<string>;
};

export type SwissPairingResult = { pairs: Pairing[]; bye: string | null };

// Fields are at most a few dozen players, so a bounded search finds a rematch-free round
// whenever one exists in practice; the bound keeps a pathological history from stalling a tick.
const SEARCH_STEPS = 20_000;

/**
 * Pairs one Swiss round. Each player, from the top, takes the best-placed partner they have
 * not faced, so score groups pair inside themselves and a leftover floats down; when that
 * leaves a rematch further down, the search backtracks. Only when no rematch-free round
 * exists are rematches accepted, as few as possible and between the closest scores.
 */
export function pairSwissRound(input: SwissPairingInput): SwissPairingResult {
	const order =
		input.round === 1
			? seededShuffle(
					[...input.players].sort((a, b) => compareIds(a.userId, b.userId)),
					`${input.seed}:${input.round}`,
				)
			: [...input.players];
	const faced = facedPairs(input.history);

	if (order.length % 2 === 0) {
		return {
			pairs: pairWithoutRematch(order, faced) ?? pairWithFewestRematches(order, faced),
			bye: null,
		};
	}

	const candidates = byeCandidates(order, input.hadBye);
	for (const candidate of candidates) {
		const pairs = pairWithoutRematch(without(order, candidate), faced);
		if (pairs) return { pairs, bye: candidate.userId };
	}
	const [bye] = candidates;
	return { pairs: pairWithFewestRematches(without(order, bye), faced), bye: bye.userId };
}

// The lowest-placed player without a bye first; moving up only spares a forced rematch. When
// everyone already had one, the lowest-placed player takes another.
function byeCandidates(order: SwissPlayer[], hadBye: ReadonlySet<string>): SwissPlayer[] {
	const fromBottom = [...order].reverse();
	const fresh = fromBottom.filter((player) => !hadBye.has(player.userId));
	return fresh.length > 0 ? fresh : [fromBottom[0]];
}

function pairWithoutRematch(order: SwissPlayer[], faced: Set<string>): Pairing[] | null {
	const used = order.map(() => false);
	const pairs: Pairing[] = [];
	let steps = 0;

	const search = (): boolean | "exhausted" => {
		const first = used.indexOf(false);
		if (first < 0) return true;
		used[first] = true;
		for (let next = first + 1; next < order.length; next++) {
			if (used[next] || faced.has(key(order[first].userId, order[next].userId))) continue;
			if (++steps > SEARCH_STEPS) return "exhausted";
			used[next] = true;
			pairs.push({ seat0: order[first].userId, seat1: order[next].userId });
			const found = search();
			if (found) return found;
			pairs.pop();
			used[next] = false;
		}
		used[first] = false;
		return false;
	};

	return search() === true ? pairs : null;
}

type Cost = { rematches: number; gap: number };

const cheaper = (a: Cost, b: Cost) =>
	a.rematches < b.rematches || (a.rematches === b.rematches && a.gap < b.gap);

// Branch and bound over the same walk, with rematches allowed: the first descent always
// completes a round, and the rest of the budget looks for fewer or closer rematches.
function pairWithFewestRematches(order: SwissPlayer[], faced: Set<string>): Pairing[] {
	const used = order.map(() => false);
	const pairs: Pairing[] = [];
	let best: { pairs: Pairing[]; cost: Cost } | null = null;
	let steps = 0;

	const search = (cost: Cost): void => {
		if (best && !cheaper(cost, best.cost)) return;
		const first = used.indexOf(false);
		if (first < 0) {
			best = { pairs: [...pairs], cost };
			return;
		}
		used[first] = true;
		const partners = order
			.map((player, index) => ({ player, index }))
			.filter(({ index }) => index > first && !used[index])
			.map(({ player, index }) => {
				const rematch = faced.has(key(order[first].userId, player.userId));
				return { index, rematch, gap: Math.abs(order[first].score - player.score) };
			})
			.sort((a, b) => Number(a.rematch) - Number(b.rematch) || (a.rematch ? a.gap - b.gap : 0));
		for (const partner of partners) {
			if (best && ++steps > SEARCH_STEPS) break;
			used[partner.index] = true;
			pairs.push({ seat0: order[first].userId, seat1: order[partner.index].userId });
			search(
				partner.rematch ? { rematches: cost.rematches + 1, gap: cost.gap + partner.gap } : cost,
			);
			pairs.pop();
			used[partner.index] = false;
		}
		used[first] = false;
	};

	search({ rematches: 0, gap: 0 });
	return (best as { pairs: Pairing[] } | null)?.pairs ?? [];
}

function facedPairs(history: SwissPairingInput["history"]): Set<string> {
	return new Set(history.map(([a, b]) => key(a, b)));
}

function key(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function without(order: SwissPlayer[], player: SwissPlayer): SwissPlayer[] {
	return order.filter((candidate) => candidate !== player);
}

function compareIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// Fisher-Yates driven by a small seeded generator (FNV-1a hash into mulberry32): the draw
// only has to be fair and repeatable, not unpredictable.
function seededShuffle<T>(items: T[], seed: string): T[] {
	let state = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		state ^= seed.charCodeAt(i);
		state = Math.imul(state, 0x01000193);
	}
	const random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
