import { EventDefinition, PrizeTier } from "./EventDefinition";
import { DuelResolution } from "./ReservedDuelRecord";

export const EVENT_RUN_STATUSES = ["ready", "won", "lost", "expired", "superseded"] as const;

export type EventRunStatus = (typeof EVENT_RUN_STATUSES)[number];

export type EventRun = {
	id: string;
	userId: string;
	eventId: string;
	deckId: string;
	status: EventRunStatus;
	/** 1-based wave the player faces next (or faced last once the run ended). */
	currentWave: number;
	wavesCleared: number;
	/**
	 * The rival drawn for the current wave, kept until that wave is won so a voided duel is
	 * retried against the same bot. Null until drawn.
	 */
	currentBot: string | null;
	/** Rivals of the waves already cleared, in order. */
	facedBots: string[];
	/** The reservation issued for the current wave and not yet applied. */
	currentReservationId: string | null;
	/** Duels the player never started (lobby leave, no-show). */
	voids: number;
	createdAt: Date;
	updatedAt: Date;
};

// More player voids than this end the run: leaving the lobby is not a free reroll.
export const MAX_VOIDS = 3;

// A ready run nobody touched for this long is abandoned.
export const READY_RUN_IDLE_MS = 24 * 60 * 60 * 1000;

export function startEventRun(input: {
	id: string;
	userId: string;
	eventId: string;
	deckId: string;
	now: Date;
}): EventRun {
	return {
		id: input.id,
		userId: input.userId,
		eventId: input.eventId,
		deckId: input.deckId,
		status: "ready",
		currentWave: 1,
		wavesCleared: 0,
		currentBot: null,
		facedBots: [],
		currentReservationId: null,
		voids: 0,
		createdAt: input.now,
		updatedAt: input.now,
	};
}

// Applies one duel result to the run that issued it. The reservation is always cleared:
// a result is applied exactly once, after which the wave needs a new reservation. A win
// moves the rival to `facedBots` and leaves the next wave's rival to be drawn.
export function advanceRun(
	run: EventRun,
	resolution: DuelResolution,
	totalWaves: number,
	now: Date,
): EventRun {
	const next: EventRun = { ...run, currentReservationId: null, updatedAt: now };
	switch (resolution) {
		case "win": {
			const wavesCleared = run.wavesCleared + 1;
			const facedBots = run.currentBot ? [...run.facedBots, run.currentBot] : run.facedBots;
			const cleared = { ...next, wavesCleared, facedBots, currentBot: null };
			if (run.currentWave >= totalWaves) return { ...cleared, status: "won" };
			return { ...cleared, currentWave: run.currentWave + 1 };
		}
		case "loss":
			return { ...next, status: "lost" };
		case "player_void": {
			const voids = run.voids + 1;
			return { ...next, voids, status: voids > MAX_VOIDS ? "lost" : run.status };
		}
		case "void":
		case "stale_void":
			return next;
	}
}

// Tiers whose threshold lies in (before, after]: the ones this result just crossed.
export function tiersCrossed(tiers: PrizeTier[], before: number, after: number): PrizeTier[] {
	return tiers.filter((tier) => tier.wavesCleared > before && tier.wavesCleared <= after);
}

// A ready run expires when the event closes or after a day without activity. Callers must
// not expire a run whose duel is still live: its result is applied first.
export function isRunIdle(run: EventRun, event: EventDefinition, now: Date): boolean {
	if (run.status !== "ready") return false;
	if (now.getTime() >= event.endsAt.getTime()) return true;
	return now.getTime() - run.updatedAt.getTime() >= READY_RUN_IDLE_MS;
}
