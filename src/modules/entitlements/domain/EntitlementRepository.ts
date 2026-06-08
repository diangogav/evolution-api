import { Entitlement } from "./Entitlement";

export interface EntitlementRepository {
	findByUserId(userId: string): Promise<Entitlement[]>;
	save(entitlement: Entitlement): Promise<void>;
}
