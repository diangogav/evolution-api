/** A reservation a pairing pass issued: the two seats are called to their duel. */
export type LightningSummons = {
	tournamentId: string;
	tournamentName: string;
	reservationId: string;
	userIds: readonly [string, string];
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
	seat0: string,
	seat1: string,
): LightningSummons {
	return {
		tournamentId: tournament.id,
		tournamentName: tournament.name,
		reservationId,
		userIds: [seat0, seat1],
		lobbyTimeoutSeconds: tournament.lobbyTimeoutSeconds,
	};
}
