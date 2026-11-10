import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { ReservedDuelRecord } from "./ReservedDuelRecord";

// Reads the duel server's records for reservations the caller issued. Callers pass only
// their own ids: this port never lists rows other features wrote.
export interface ReservedDuelRecordReader {
	findRecords(reservationIds: string[], manager?: QueryableManager): Promise<ReservedDuelRecord[]>;
}
