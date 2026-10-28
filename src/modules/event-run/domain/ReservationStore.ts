import { DuelReservation } from "./DuelReservation";

export type RevokeResult = "revoked" | "in_use" | "gone";

// Where the duel server picks reservations up (Redis). Claim (server) and revoke (API) are
// atomic on the same key, so a reservation is either claimed or revoked, never both.
export interface ReservationStore {
	issue(reservation: DuelReservation, ttlSeconds: number): Promise<void>;
	revoke(reservationId: string): Promise<RevokeResult>;
}
