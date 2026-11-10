// Read-only view of a row the duel server writes to its own `reserved_duels` table. The
// API never writes it; it only reads the rows of reservations it issued.
export const RESERVED_DUEL_OUTCOMES = ["decided", "draw", "abandoned"] as const;

export type ReservedDuelOutcome = (typeof RESERVED_DUEL_OUTCOMES)[number];

export type ReservedDuelRecord = {
	reservationId: string;
	/** The server room playing the reservation; what spectators join with `w,<roomId>`. */
	roomId: number | null;
	joinedAt: Date | null;
	startedAt: Date | null;
	endedAt: Date | null;
	outcome: ReservedDuelOutcome | null;
	winnerSeat: number | null;
	abandonedBySeat: number | null;
	reason: string | null;
};
