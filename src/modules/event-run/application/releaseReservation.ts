import { ConflictError } from "../../../shared/errors/ConflictError";
import { EventRun } from "../domain/EventRun";
import { ReservationStore } from "../domain/ReservationStore";

// Drops the run's current reservation before a new one is issued or the run is replaced.
// Callers apply the pending record first, so a reservation still set here was either
// never claimed (revoked or expired: safe to drop) or belongs to a live duel (409).
// Claim and revoke are atomic on the same key, so no duel can start under a reservation
// this revoked.
export async function releaseReservation(
	run: EventRun,
	duelLive: boolean,
	reservations: ReservationStore,
): Promise<void> {
	if (!run.currentReservationId) return;
	if (duelLive) throw new ConflictError("A duel is in progress for this run");
	const revoked = await reservations.revoke(run.currentReservationId);
	if (revoked === "in_use") throw new ConflictError("A duel is in progress for this run");
}
