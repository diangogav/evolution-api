import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { Entitlement } from "./Entitlement";

// `manager` joins a transaction another module opened (a purchase debits and grants
// atomically), so the writes land or fail with it instead of on a second connection.
export interface EntitlementRepository {
	findByUserId(userId: string, manager?: QueryableManager): Promise<Entitlement[]>;
	save(entitlement: Entitlement, manager?: QueryableManager): Promise<void>;
}
