/** A reservation a pairing pass issued: the two seats are called to their duel. */
export type LightningSummons = {
	tournamentId: string;
	tournamentName: string;
	reservationId: string;
	/** The human seats; a bot is never called. */
	userIds: readonly string[];
	/** How long the room waits for both seats before the absent one loses by no-show. */
	lobbyTimeoutSeconds: number;
};

/**
 * Tells the paired players their duel is ready. Called only with reservations whose tick
 * committed; best effort, it must neither throw nor hold up the next tick.
 */
export interface LightningSummonsNotifier {
	notify(summons: readonly LightningSummons[], now: Date): Promise<void>;
}

export function lightningSummons(
	tournament: { id: string; name: string; lobbyTimeoutSeconds: number },
	reservationId: string,
	seats: ReadonlyArray<{ userId: string; botName?: string | null }>,
): LightningSummons {
	return {
		tournamentId: tournament.id,
		tournamentName: tournament.name,
		reservationId,
		userIds: seats.filter((seat) => typeof seat.botName !== "string").map((seat) => seat.userId),
		lobbyTimeoutSeconds: tournament.lobbyTimeoutSeconds,
	};
}
