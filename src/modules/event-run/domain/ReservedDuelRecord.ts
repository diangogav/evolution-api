// Read-only view of a row the duel server writes to its own `reserved_duels` table. The
// API never writes it; it only reads the rows of reservations it issued.
export const RESERVED_DUEL_OUTCOMES = ["decided", "draw", "abandoned"] as const;

export type ReservedDuelOutcome = (typeof RESERVED_DUEL_OUTCOMES)[number];

export type ReservedDuelRecord = {
	reservationId: string;
	joinedAt: Date | null;
	startedAt: Date | null;
	endedAt: Date | null;
	outcome: ReservedDuelOutcome | null;
	winnerSeat: number | null;
	abandonedBySeat: number | null;
	reason: string | null;
};

// The API issues every event reservation with the player at seat 0 and the wave bot at
// seat 1, so the seats are fixed here rather than read back from the participants.
export const PLAYER_SEAT = 0;
export const BOT_SEAT = 1;

// The engine ends a stalled duel on response timeout, so a row still open after this long
// means the server lost track of it (crash without boot sweep, lost terminal write).
export const STALE_DUEL_MS = 2 * 60 * 60 * 1000;

// Reasons the server records when the infrastructure, not the player, ended the room.
const INFRASTRUCTURE_REASONS = new Set(["server_restart", "bot_unavailable"]);

/**
 * What a duel record means for the run:
 * - `win` / `loss`: the wave was played.
 * - `void`: infrastructure failure (restart, bot unavailable, room closed before the duel
 *   started); same wave, free.
 * - `player_void`: the player seat never started the duel (left the lobby, no-show); same
 *   wave, counted against the run's void allowance.
 * - `stale_void`: the row never closed; treated as an infrastructure failure.
 */
export type DuelResolution = "win" | "loss" | "void" | "player_void" | "stale_void";

// Null while the duel is still live (no `ended_at` and not stale yet).
export function resolveDuelRecord(record: ReservedDuelRecord, now: Date): DuelResolution | null {
	if (!record.endedAt) {
		const openedAt = record.joinedAt ?? record.startedAt;
		if (openedAt && now.getTime() - openedAt.getTime() > STALE_DUEL_MS) return "stale_void";
		return null;
	}

	if (record.outcome === "draw") return "loss";
	if (record.outcome === "decided") {
		if (record.winnerSeat === PLAYER_SEAT) return "win";
		if (record.winnerSeat === BOT_SEAT) return "loss";
		// A decided duel without a usable winner is a server bug; never cost the player a run.
		return "void";
	}

	if (record.reason && INFRASTRUCTURE_REASONS.has(record.reason)) return "void";
	if (record.startedAt) return "loss";
	// Before the duel started only the player seat can cost a void. The server records every
	// other pre-start close (the bot leaving included) without a seat, so it is free.
	return record.abandonedBySeat === PLAYER_SEAT ? "player_void" : "void";
}
