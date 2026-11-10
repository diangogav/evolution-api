// Public surface of the reserved-duel module: the reservation contract shared with the
// duel server and the read-only view of its records. Other modules import from here,
// never from its folders; see the module boundaries section of docs/architecture.md.

export {
	generateReservationId,
	RESERVATION_ID_LENGTH,
	RESERVATION_PASSWORD_PREFIX,
	RESERVATION_TTL_SECONDS,
	reservationPassword,
} from "./domain/DuelReservation";
export type {
	DuelReservation,
	RandomBytes,
	RequiredDeck,
	ReservationParticipant,
} from "./domain/DuelReservation";
export type { ReservationStore, RevokeResult } from "./domain/ReservationStore";
export { RESERVED_DUEL_OUTCOMES } from "./domain/ReservedDuelRecord";
export type { ReservedDuelOutcome, ReservedDuelRecord } from "./domain/ReservedDuelRecord";
export type { ReservedDuelRecordReader } from "./domain/ReservedDuelRecordReader";
