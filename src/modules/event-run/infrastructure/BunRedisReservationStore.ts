import { RedisClient } from "bun";

import { DuelReservation } from "../domain/DuelReservation";
import { ReservationStore, RevokeResult } from "../domain/ReservationStore";

export const RESERVATION_KEY_PREFIX = "duel:reservation:";

// Mirrors the server's claim script: both run atomically on the key, so a reservation is
// either claimed (claim set) or revoked (deleted), never both. An unreadable payload is
// treated as in use rather than deleted; it expires on its own TTL.
export const REVOKE_SCRIPT = `local raw = redis.call('GET', KEYS[1])
if not raw then return 'gone' end
local ok, reservation = pcall(cjson.decode, raw)
if not ok or type(reservation) ~= 'table' then return 'in_use' end
if reservation.claim ~= nil and reservation.claim ~= cjson.null then return 'in_use' end
redis.call('DEL', KEYS[1])
return 'revoked'`;

export class ReservationIdCollisionError extends Error {
	constructor(reservationId: string) {
		super(`Reservation ${reservationId} already exists`);
		this.name = "ReservationIdCollisionError";
	}
}

export class BunRedisReservationStore implements ReservationStore {
	constructor(private readonly client: RedisClient) {}

	// SET with EX and NX in one command: the key never exists without a TTL, and an id
	// collision never overwrites someone else's reservation.
	async issue(reservation: DuelReservation, ttlSeconds: number): Promise<void> {
		const key = `${RESERVATION_KEY_PREFIX}${reservation.reservationId}`;
		const reply = await this.client.send("SET", [
			key,
			JSON.stringify(reservation),
			"EX",
			String(ttlSeconds),
			"NX",
		]);
		if (reply !== "OK") throw new ReservationIdCollisionError(reservation.reservationId);
	}

	async revoke(reservationId: string): Promise<RevokeResult> {
		const key = `${RESERVATION_KEY_PREFIX}${reservationId}`;
		const reply = await this.client.send("EVAL", [REVOKE_SCRIPT, "1", key]);
		if (reply === "revoked" || reply === "in_use" || reply === "gone") return reply;
		throw new Error(`Unexpected revoke reply for ${reservationId}: ${String(reply)}`);
	}
}
