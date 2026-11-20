import { DuelResolution } from "../../event-run";

// One player's state on one door. A row exists once the player requested a duel for the
// door or recovered it; a door never touched has none.
export type DoorProgress = {
	userId: string;
	calendarId: string;
	day: number;
	recoveredAt: Date | null;
	clearedAt: Date | null;
	/** Duels that counted against the player: wins, losses and duels left before they started. */
	attempts: number;
	dieRoll: number | null;
	currentReservationId: string | null;
};

export const DOOR_STATUSES = ["locked", "open", "missed", "cleared"] as const;

export type DoorStatus = (typeof DOOR_STATUSES)[number];

/**
 * - `locked`: its day has not come.
 * - `open`: playable, because it is today's door or a past one the player recovered.
 * - `missed`: a past day never cleared; playable again only after recovering it.
 * - `cleared`: won. Losing never changes a status, so a door can be retried freely.
 */
export function doorStatus(day: number, today: number, progress: DoorProgress | null): DoorStatus {
	if (progress?.clearedAt) return "cleared";
	if (day > today) return "locked";
	if (day === today || progress?.recoveredAt) return "open";
	return "missed";
}

export function canRecoverDoor(day: number, today: number, progress: DoorProgress | null): boolean {
	return doorStatus(day, today, progress) === "missed";
}

// What a finished duel does to its door. The reservation pointer is always cleared. A duel
// the player left before it started counts as an attempt, so quitting a losing position
// cannot preserve a first-try win; infrastructure failures are free. A second win on a door
// already cleared changes nothing.
export function applyDuelToDoor(
	progress: DoorProgress,
	resolution: DuelResolution,
	now: Date,
): DoorProgress {
	const released = { ...progress, currentReservationId: null };
	if (progress.clearedAt) return released;
	if (resolution === "void" || resolution === "stale_void") return released;
	return {
		...released,
		attempts: progress.attempts + 1,
		clearedAt: resolution === "win" ? now : null,
	};
}

export function wonFirstTry(progress: DoorProgress): boolean {
	return progress.clearedAt !== null && progress.attempts === 1;
}

export function canRollDie(progress: DoorProgress | null): boolean {
	return progress !== null && progress.clearedAt !== null && progress.dieRoll === null;
}
