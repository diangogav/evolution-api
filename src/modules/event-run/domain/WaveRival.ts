import { EventDefinition, findEventDeck, waveOf } from "./EventDefinition";
import { EventRun } from "./EventRun";

/** Returns an integer in [0, size). The draw's only source of randomness, so tests fix it. */
export type PickIndex = (size: number) => number;

export const randomPickIndex: PickIndex = (size) => {
	// 2^32 is not a multiple of every pool size; rejecting the tail keeps every rival equally likely.
	const limit = Math.floor(0x1_0000_0000 / size) * size;
	const buffer = new Uint32Array(1);
	for (;;) {
		crypto.getRandomValues(buffer);
		if (buffer[0] < limit) return buffer[0] % size;
	}
};

export class WaveRivalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WaveRivalError";
	}
}

/**
 * The rival of one wave, drawn from its pool: never the bot that pilots the player's own deck
 * (no mirror match) and never a bot the run already faced. Should both rules empty the pool
 * (a catalog with fewer rivals than waves sharing it), only the mirror rule is kept, so the
 * wave stays playable.
 */
export function drawRival(input: {
	pool: readonly string[];
	ownDeckBot: string | null;
	faced: readonly string[];
	pick: PickIndex;
}): string {
	const notMirror = input.pool.filter((bot) => bot !== input.ownDeckBot);
	const fresh = notMirror.filter((bot) => !input.faced.includes(bot));
	const candidates = fresh.length > 0 ? fresh : notMirror;
	if (candidates.length === 0) throw new WaveRivalError("The wave pool has no rival to draw");
	return candidates[input.pick(candidates.length)];
}

// Gives a ready run without a rival the one of its current wave. Runs that already have one
// keep it (a voided duel is retried against the same bot), and ended runs need none.
export function assignRival(run: EventRun, event: EventDefinition, pick: PickIndex): EventRun {
	if (run.status !== "ready" || run.currentBot) return run;
	const wave = waveOf(event, run.currentWave);
	if (!wave) throw new WaveRivalError(`Event "${event.id}" has no wave ${run.currentWave}`);
	const currentBot = drawRival({
		pool: wave.pool,
		ownDeckBot: findEventDeck(event, run.deckId)?.botName ?? null,
		faced: run.facedBots,
		pick,
	});
	return { ...run, currentBot };
}
